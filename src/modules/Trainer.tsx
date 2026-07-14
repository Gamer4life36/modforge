import { useEffect, useMemo, useState } from "react";
import {
  pickFile,
  readFile,
  writeFile,
  sqliteTables,
  sqliteTable,
  sqliteSet,
} from "../lib/tauri-io";
import { detectFormat, isStructured, type Format } from "../core/detect";
import { parseContent, stringifyContent } from "../core/formats";
import { flatten, setAtPath, type LeafType } from "../core/model";
import {
  categorize,
  CATEGORY_META,
  ORDERED_CATEGORIES,
  prettyLabel,
  type StatCategory,
} from "../core/trainer";

type Entry =
  | {
      kind: "file";
      id: string;
      label: string;
      pretty: string;
      path: (string | number)[];
      type: LeafType;
      value: number;
      category: StatCategory;
    }
  | {
      kind: "sqlite";
      id: string;
      label: string;
      pretty: string;
      table: string;
      rowid: number;
      column: string;
      value: number;
      category: StatCategory;
    };

const basename = (p: string) => p.replace(/\\/g, "/").split("/").pop() ?? p;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isNum = (s: string) => s.trim() !== "" && Number.isFinite(Number(s));

export default function Trainer({
  setStatus,
  autoOpen,
}: {
  setStatus: (s: string) => void;
  autoOpen?: { path: string; nonce: number };
}) {
  const [path, setPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [fileData, setFileData] = useState<unknown>(null);
  const [fileFormat, setFileFormat] = useState<Format>("json");
  const [fileRaw, setFileRaw] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const cat of ORDERED_CATEGORIES) if (!CATEGORY_META[cat].defaultOpen) c[cat] = true;
    return c;
  });

  function finish(p: string, ents: Entry[], kind: string) {
    setPath(p);
    setEntries(ents);
    const v: Record<string, string> = {};
    ents.forEach((e) => (v[e.id] = String(e.value)));
    setValues(v);
    setStatus(`Scanned ${basename(p)} (${kind}) — found ${ents.length} editable number(s)`);
  }

  // When the Device tab pulls a save and hands it off, open it automatically.
  useEffect(() => {
    if (autoOpen && autoOpen.path) openPath(autoOpen.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen?.nonce]);

  async function open() {
    const p = await pickFile();
    if (p) openPath(p);
  }

  async function openPath(p: string) {
    // 1) try SQLite
    try {
      const tables = await sqliteTables(p);
      const ents: Entry[] = [];
      for (const t of tables) {
        const td = await sqliteTable(p, t);
        td.rows.forEach((row, ri) => {
          row.forEach((cell, ci) => {
            if (isNum(cell)) {
              const col = td.columns[ci];
              ents.push({
                kind: "sqlite",
                id: `${t}.${td.rowids[ri]}.${col}`,
                label: `${t}.${col}`,
                pretty: `${t} › ${col}`,
                table: t,
                rowid: td.rowids[ri],
                column: col,
                value: Number(cell),
                category: categorize(`${t} ${col}`),
              });
            }
          });
        });
      }
      setFileData(null);
      finish(p, ents, "SQLite");
      return;
    } catch {
      /* not a SQLite db — fall through */
    }

    // 2) structured file
    try {
      const res = await readFile(p);
      const fmt = detectFormat(res.path, res.text, res.is_binary);
      if (!isStructured(fmt)) {
        setStatus(`${basename(p)} isn't structured or SQLite (${fmt}). Open it in the Editor tab for raw/hex.`);
        return;
      }
      const parsed = parseContent(fmt, res.text);
      if (!parsed.ok) {
        setStatus("Parse failed: " + parsed.error);
        return;
      }
      const ents: Entry[] = flatten(parsed.data)
        .filter((r) => r.type === "number")
        .map((r) => ({
          kind: "file",
          id: r.label,
          label: r.label,
          pretty: prettyLabel(r.label),
          path: r.path,
          type: r.type,
          value: Number(r.value),
          category: categorize(r.label),
        }));
      setFileData(parsed.data);
      setFileFormat(fmt);
      setFileRaw(res.text);
      finish(p, ents, fmt.toUpperCase());
    } catch (e) {
      setStatus("Open failed: " + msg(e));
    }
  }

  async function commit(entry: Entry, raw: string) {
    if (!path) return;
    const numVal = Number(raw);
    try {
      let backup: string | null = null;
      if (entry.kind === "sqlite") {
        backup = await sqliteSet(path, entry.table, entry.rowid, entry.column, raw);
      } else {
        const clone = structuredClone(fileData);
        setAtPath(clone, entry.path, Number.isFinite(numVal) ? numVal : raw);
        const contents = stringifyContent(fileFormat, clone, fileRaw);
        backup = await writeFile(path, contents, true);
        setFileData(clone);
      }
      setEntries((es) =>
        es.map((e) => (e.id === entry.id ? { ...e, value: Number.isFinite(numVal) ? numVal : e.value } : e))
      );
      setValues((vv) => ({ ...vv, [entry.id]: raw }));
      setStatus(`Set ${entry.pretty} = ${raw}${backup ? ` · backup: ${basename(backup)}` : ""}`);
    } catch (e) {
      setStatus("Save failed: " + msg(e));
    }
  }

  const filtered = useMemo(() => {
    const s = search.trim();
    if (!s) return entries;
    if (isNum(s)) {
      const n = Number(s);
      return entries.filter((e) => e.value === n);
    }
    const low = s.toLowerCase();
    return entries.filter((e) => e.label.toLowerCase().includes(low));
  }, [entries, search]);

  const byCat = useMemo(() => {
    const m: Record<string, Entry[]> = {};
    for (const e of filtered) (m[e.category] ??= []).push(e);
    return m;
  }, [filtered]);

  return (
    <div className="module-trainer">
      <div className="subbar">
        <button className="btn" onClick={open}>Open game save…</button>
        {path && <span className="fname" title={path}>{basename(path)}</span>}
        <div className="spacer" />
        {entries.length > 0 && (
          <input
            className="filter"
            style={{ width: 260 }}
            placeholder="Find a value you see in-game (e.g. 500)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </div>

      <div className="trainer-body">
        {!path && (
          <div className="empty">
            <p>Open an offline game's save file to find and edit its stats.</p>
            <button className="btn primary" onClick={open}>Open a save</button>
            <p className="hint">
              Works on JSON / XML / INI / SQLite saves. It auto-finds money, health,
              resources… every edit is backed up first. Offline / single-player only.
            </p>
          </div>
        )}

        {path && entries.length === 0 && (
          <div className="empty"><p className="hint">No editable numbers found in this file.</p></div>
        )}

        {ORDERED_CATEGORIES.map((cat) => {
          const list = byCat[cat];
          if (!list || list.length === 0) return null;
          const meta = CATEGORY_META[cat];
          const isOpen = !collapsed[cat];
          return (
            <div className="trainer-cat" key={cat}>
              <button
                className="cat-head"
                onClick={() => setCollapsed((c) => ({ ...c, [cat]: isOpen }))}
              >
                <span>{meta.icon} {meta.label}</span>
                <span className="cat-count">{list.length}{isOpen ? " ▾" : " ▸"}</span>
              </button>
              {isOpen && (
                <div className="stat-list">
                  {list.map((e) => (
                    <div className="trainer-row" key={e.id}>
                      <span className="trainer-label" title={e.label}>{e.pretty}</span>
                      <input
                        className="valinput"
                        value={values[e.id] ?? String(e.value)}
                        onChange={(ev) => setValues((v) => ({ ...v, [e.id]: ev.target.value }))}
                        onBlur={(ev) => {
                          if (ev.target.value !== String(e.value)) commit(e, ev.target.value);
                        }}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
                        }}
                      />
                      <button
                        className="btn"
                        title="Set to 999,999"
                        onClick={() => {
                          setValues((v) => ({ ...v, [e.id]: "999999" }));
                          commit(e, "999999");
                        }}
                      >
                        Max
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
