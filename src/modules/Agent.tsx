import { useEffect, useMemo, useState } from "react";
import {
  pickFile,
  readBytes,
  writeBytes,
  listBackups,
  restoreBackup,
  type BackupInfo,
} from "../lib/tauri-io";
import { scanSave, applyEdits, isNrbf, type NrbfField, type Edit } from "../core/nrbf";
import { scanProtobuf, applyProtobufEdits, type ProtobufScan } from "../core/protobuf";
import {
  planSaveEdits,
  hasKey,
  type AgentField,
  NoKeyError,
} from "../lib/ai";
import {
  categorize,
  CATEGORY_META,
  ORDERED_CATEGORIES,
  prettyLabel,
} from "../core/trainer";

const basename = (p: string) => p.replace(/\\/g, "/").split("/").pop() ?? p;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Proposal {
  field: NrbfField;
  newValue: number;
  reason: string;
  apply: boolean;
}

export default function Agent({
  setStatus,
  autoOpen,
}: {
  setStatus: (s: string) => void;
  autoOpen?: { path: string; nonce: number };
}) {
  const [path, setPath] = useState<string | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [fields, setFields] = useState<NrbfField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [drift, setDrift] = useState<string | undefined>(undefined);
  const [format, setFormat] = useState<"nrbf" | "protobuf" | null>(null);
  const [protoScan, setProtoScan] = useState<ProtobufScan | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [showBackups, setShowBackups] = useState(false);

  const [goal, setGoal] = useState("");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (autoOpen?.path) openPath(autoOpen.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen?.nonce]);

  async function open() {
    const p = await pickFile();
    if (p) openPath(p);
  }

  async function openPath(p: string) {
    setBusy(true);
    setProposals([]);
    setShowBackups(false);
    try {
      const b = await readBytes(p);
      // Format detection: .NET BinaryFormatter first, then protobuf, else best-effort NRBF.
      let fmt: "nrbf" | "protobuf" = "nrbf";
      let scanned: NrbfField[] = [];
      let driftMsg: string | undefined;
      let proto: ProtobufScan | null = null;
      if (isNrbf(b)) {
        const res = scanSave(b);
        scanned = res.fields;
        driftMsg = res.drift;
      } else if ((proto = scanProtobuf(b))) {
        fmt = "protobuf";
        scanned = proto.fields;
      } else {
        const res = scanSave(b);
        scanned = res.fields;
        driftMsg = res.drift;
      }
      setBytes(b);
      setPath(p);
      setFormat(fmt);
      setProtoScan(proto);
      setFields(scanned);
      setDrift(driftMsg);
      const v: Record<string, string> = {};
      scanned.forEach((f) => (v[f.id] = String(f.value)));
      setValues(v);
      await refreshBackups(p);
      setStatus(
        `Scanned ${basename(p)} [${fmt.toUpperCase()}] — ${scanned.length} editable field(s)` +
          (driftMsg ? " (partial: nested data recovered by pattern scan)" : "")
      );
    } catch (e) {
      setStatus("Open failed: " + msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function refreshBackups(p = path) {
    if (!p) return;
    try { setBackups(await listBackups(p)); } catch { /* ignore */ }
  }

  async function doRestore(backupPath: string) {
    if (!path) return;
    setBusy(true);
    try {
      await restoreBackup(backupPath, path);
      setShowBackups(false);
      await openPath(path); // re-read & re-scan the restored file
      setStatus(`Restored ${basename(backupPath)} → ${basename(path)}`);
    } catch (e) {
      setStatus("Restore failed: " + msg(e));
    } finally {
      setBusy(false);
    }
  }

  const catOf = (f: NrbfField) => categorize(`${f.className} ${f.member}`);

  /** Write one or more edits to disk (with backup) and refresh in-memory state. */
  async function commit(edits: { field: NrbfField; value: number }[]) {
    if (!path || !bytes) return;
    try {
      let next: Uint8Array;
      if (format === "protobuf" && protoScan) {
        // protobuf re-encodes; only edited branches change, rest stays byte-identical
        next = applyProtobufEdits(bytes, protoScan, edits.map((e) => ({ path: e.field.id, value: e.value })));
      } else {
        const e: Edit[] = edits.map(({ field, value }) => ({ offset: field.offset, kind: field.kind, value }));
        next = applyEdits(bytes, e); // NRBF: length-preserving byte patch
      }
      const backup = await writeBytes(path, next, true);

      if (format === "protobuf") {
        // offsets shift after re-encode → re-scan for fresh field positions
        const s = scanProtobuf(next);
        setBytes(next);
        if (s) {
          setProtoScan(s);
          setFields(s.fields);
          const v: Record<string, string> = {};
          s.fields.forEach((f) => (v[f.id] = String(f.value)));
          setValues(v);
        }
      } else {
        setBytes(next);
        setFields((fs) =>
          fs.map((f) => {
            const hit = edits.find((x) => x.field.id === f.id);
            return hit ? { ...f, value: hit.value } : f;
          })
        );
        setValues((vv) => {
          const n = { ...vv };
          edits.forEach(({ field, value }) => (n[field.id] = String(value)));
          return n;
        });
      }
      await refreshBackups();
      setStatus(
        `Wrote ${edits.length} edit(s) to ${basename(path)}` +
          (backup ? ` · backup: ${basename(backup)}` : "")
      );
    } catch (err) {
      setStatus("Write failed: " + msg(err));
    }
  }

  async function commitOne(field: NrbfField, raw: string) {
    const n = field.kind === "bool" ? (raw.trim() === "1" || /true/i.test(raw) ? 1 : 0) : Number(raw);
    if (!Number.isFinite(n)) return;
    await commit([{ field, value: n }]);
  }

  async function plan() {
    if (!fields.length) return;
    if (!hasKey()) {
      setStatus("Add an Anthropic API key in the Editor tab's AI settings first.");
      return;
    }
    if (!goal.trim()) return;
    setBusy(true);
    setProposals([]);
    setNote("");
    try {
      const agentFields: AgentField[] = fields.map((f, i) => ({
        index: i,
        label: `${f.className}.${f.member}`,
        kind: f.kind,
        value: f.value,
        category: catOf(f),
      }));
      const { edits, note } = await planSaveEdits(agentFields, goal.trim());
      setNote(note);
      setProposals(
        edits.map((e) => ({
          field: fields[e.index],
          newValue: e.newValue,
          reason: e.reason,
          apply: true,
        }))
      );
      setStatus(
        edits.length
          ? `AI proposed ${edits.length} edit(s) — review and apply.`
          : "AI proposed no edits. Try rephrasing the goal."
      );
    } catch (e) {
      setStatus(e instanceof NoKeyError ? e.message : "AI planning failed: " + msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function applyProposals() {
    const chosen = proposals.filter((p) => p.apply);
    if (!chosen.length) return;
    await commit(chosen.map((p) => ({ field: p.field, value: p.newValue })));
    setProposals([]);
    setNote("");
  }

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return fields;
    if (/^\d+$/.test(s)) return fields.filter((f) => f.value === Number(s));
    return fields.filter((f) => `${f.className}.${f.member}`.toLowerCase().includes(s));
  }, [fields, search]);

  const byCat = useMemo(() => {
    const m: Record<string, NrbfField[]> = {};
    for (const f of filtered) (m[catOf(f)] ??= []).push(f);
    return m;
  }, [filtered]);

  return (
    <div className="module-trainer">
      <div className="subbar">
        <button className="btn primary" disabled={busy} onClick={open}>
          📂 Open save…
        </button>
        {path && (
          <button
            className="btn"
            disabled={busy || backups.length === 0}
            onClick={() => setShowBackups((s) => !s)}
            title={backups.length ? `${backups.length} backup(s) available` : "No backups yet"}
          >
            ⟲ Restore backup{backups.length ? ` (${backups.length})` : ""}
          </button>
        )}
        {path && <span className="fname" title={path}>{basename(path)}</span>}
        {format && <span className="hint" style={{ opacity: 0.7 }}>· {format.toUpperCase()}</span>}
        <div className="spacer" />
        {busy && <span className="spin">working…</span>}
        {fields.length > 0 && (
          <input
            className="filter"
            style={{ width: 240 }}
            placeholder="Filter fields, or type a value"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </div>

      <div className="trainer-body">
        {!path && (
          <div className="empty">
            <p>Open an offline game save — including <b>.NET BinaryFormatter</b> and
              <b> Protocol Buffers</b> binaries (many Unity / C# mobile games) that the Trainer can't read.</p>
            <button className="btn primary" onClick={open}>Open a save</button>
            <p className="hint">
              It parses the binary, finds every editable number &amp; flag, and lets an AI
              turn a plain-English goal into concrete edits. Every write is backed up first.
              Offline / single-player only.
            </p>
          </div>
        )}

        {path && showBackups && (
          <div className="proposal-box" style={{ margin: "8px 4px", border: "1px solid var(--border,#333)", borderRadius: 8, padding: 10 }}>
            <div className="conv-label">⟲ Restore a backup (replaces the current file — the current version is backed up first)</div>
            {backups.length === 0 && <div className="hint" style={{ marginTop: 6 }}>No backups for this file yet.</div>}
            {backups.map((b) => (
              <div key={b.path} className="trainer-row">
                <span className="trainer-label" title={b.path}>
                  {b.name}
                  <span className="hint" style={{ display: "block" }}>
                    {new Date(b.unixtime * 1000).toLocaleString()} · {(b.size / 1024).toFixed(1)} KB
                  </span>
                </span>
                <button className="btn" disabled={busy} onClick={() => doRestore(b.path)}>Restore this</button>
              </div>
            ))}
          </div>
        )}

        {path && (
          <>
            <div className="agent-goal" style={{ padding: "10px 4px", borderBottom: "1px solid var(--border, #333)" }}>
              <div className="conv-label">🤖 Tell the agent what you want</div>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <input
                  style={{ flex: 1 }}
                  placeholder='e.g. "max all resources", "set gems to 10000", "unlock the gun"'
                  value={goal}
                  spellCheck={false}
                  onChange={(e) => setGoal(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && plan()}
                />
                <button className="btn primary" disabled={busy || !goal.trim()} onClick={plan}>
                  Plan edits
                </button>
              </div>

              {drift && (
                <p className="hint" style={{ marginTop: 6 }}>
                  Note: this save has deeply-nested data; the resource table was recovered by
                  pattern scan. Core fields (currency, levels, flags) parsed normally.
                </p>
              )}

              {(proposals.length > 0 || note) && (
                <div className="proposal-box" style={{ marginTop: 10, border: "1px solid var(--border,#333)", borderRadius: 8, padding: 10 }}>
                  {note && <div className="hint" style={{ marginBottom: 6 }}>{note}</div>}
                  {proposals.map((p, i) => (
                    <div key={p.field.id} className="trainer-row" style={{ alignItems: "flex-start" }}>
                      <input
                        type="checkbox"
                        checked={p.apply}
                        onChange={(e) =>
                          setProposals((ps) => ps.map((x, j) => (j === i ? { ...x, apply: e.target.checked } : x)))
                        }
                      />
                      <span className="trainer-label" title={`${p.field.className}.${p.field.member}`}>
                        {prettyLabel(`${p.field.className}.${p.field.member}`)}
                        <span style={{ opacity: 0.6 }}> · {p.field.value} → </span>
                        <b>{p.newValue}</b>
                        <span className="hint" style={{ display: "block" }}>{p.reason}</span>
                      </span>
                      <input
                        className="valinput"
                        value={String(p.newValue)}
                        onChange={(e) =>
                          setProposals((ps) => ps.map((x, j) => (j === i ? { ...x, newValue: Number(e.target.value) } : x)))
                        }
                      />
                    </div>
                  ))}
                  {proposals.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <button className="btn primary" disabled={busy} onClick={applyProposals}>
                        ✅ Apply selected &amp; save
                      </button>
                      <button className="btn" disabled={busy} onClick={() => { setProposals([]); setNote(""); }}>
                        Discard
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {fields.length === 0 && (
              <div className="empty"><p className="hint">No editable fields found — this may not be an NRBF/.NET save.</p></div>
            )}

            {ORDERED_CATEGORIES.map((cat) => {
              const list = byCat[cat];
              if (!list || !list.length) return null;
              const meta = CATEGORY_META[cat];
              return (
                <div className="trainer-cat" key={cat}>
                  <div className="cat-head" style={{ cursor: "default" }}>
                    <span>{meta.icon} {meta.label}</span>
                    <span className="cat-count">{list.length}</span>
                  </div>
                  <div className="stat-list">
                    {list.slice(0, 400).map((f) => (
                      <div className="trainer-row" key={f.id}>
                        <span className="trainer-label" title={`${f.className}.${f.member} @${f.offset}`}>
                          {prettyLabel(`${f.className}.${f.member}`)}
                          <span style={{ opacity: 0.5 }}> · {f.kind}</span>
                        </span>
                        <input
                          className="valinput"
                          value={values[f.id] ?? String(f.value)}
                          onChange={(ev) => setValues((v) => ({ ...v, [f.id]: ev.target.value }))}
                          onBlur={(ev) => { if (ev.target.value !== String(f.value)) commitOne(f, ev.target.value); }}
                          onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                        />
                        {f.kind !== "bool" && (
                          <button className="btn" title="Set to 10,000" onClick={() => { setValues((v) => ({ ...v, [f.id]: "10000" })); commitOne(f, "10000"); }}>
                            10k
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
