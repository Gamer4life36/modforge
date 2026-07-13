import { useMemo, useState } from "react";
import { pickFile, readFile, writeFile } from "../lib/tauri-io";
import { detectFormat, isStructured, type Format } from "../core/detect";
import { parseContent, stringifyContent } from "../core/formats";
import {
  flatten,
  setAtPath,
  coerce,
  removeAtPath,
  duplicateElement,
  isArrayElement,
  type Row,
} from "../core/model";
import {
  askAI,
  SYSTEM_PROMPT,
  NoKeyError,
  getApiKey,
  setApiKey,
  getModel,
  setModel,
  MODELS,
  hasKey,
} from "../lib/ai";

interface Loaded {
  path: string;
  format: Format;
  isBinary: boolean;
  size: number;
  raw: string;
  data: unknown | null;
  parseError?: string;
}

const basename = (p: string) => p.replace(/\\/g, "/").split("/").pop() ?? p;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function buildContext(file: Loaded): string {
  const text =
    file.data !== null && isStructured(file.format)
      ? stringifyContent(file.format, file.data, file.raw)
      : file.raw;
  const LIMIT = 12000;
  return text.length > LIMIT
    ? text.slice(0, LIMIT) + `\n... (truncated, ${text.length - LIMIT} more chars)`
    : text;
}

export default function Editor({ setStatus }: { setStatus: (s: string) => void }) {
  const [file, setFile] = useState<Loaded | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [backupOnSave, setBackupOnSave] = useState(true);
  const [filter, setFilter] = useState("");

  // undo / redo stacks of the `data` object
  const [past, setPast] = useState<unknown[]>([]);
  const [future, setFuture] = useState<unknown[]>([]);

  // AI panel
  const [showSettings, setShowSettings] = useState(!hasKey());
  const [keyInput, setKeyInput] = useState(getApiKey());
  const [model, setModelState] = useState(getModel());
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiOutput, setAiOutput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  /** Commit a new data tree, pushing the previous one onto the undo stack. */
  function applyData(next: unknown) {
    if (!file) return;
    setPast((p) => [...p, file.data]);
    setFuture([]);
    setFile({ ...file, data: next });
    setRows(flatten(next));
    setDirty(true);
  }

  function undo() {
    if (!file || past.length === 0) return;
    const prev = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [file.data, ...f]);
    setFile({ ...file, data: prev });
    setRows(prev !== null ? flatten(prev) : []);
    setDirty(true);
  }

  function redo() {
    if (!file || future.length === 0) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, file.data]);
    setFile({ ...file, data: next });
    setRows(next !== null ? flatten(next) : []);
    setDirty(true);
  }

  async function handleOpen() {
    try {
      const path = await pickFile();
      if (!path) return;
      const res = await readFile(path);
      const format = detectFormat(res.path, res.text, res.is_binary);
      let data: unknown | null = null;
      let parseError: string | undefined;
      if (isStructured(format)) {
        const p = parseContent(format, res.text);
        if (p.ok) data = p.data;
        else parseError = p.error;
      }
      setFile({ path: res.path, format, isBinary: res.is_binary, size: res.size, raw: res.text, data, parseError });
      setRows(data !== null ? flatten(data) : []);
      setPast([]);
      setFuture([]);
      setDirty(false);
      setStatus(`Opened ${basename(path)} — ${format.toUpperCase()}${parseError ? " · parse failed, raw mode" : ""}`);
    } catch (e) {
      setStatus("Open failed: " + msg(e));
    }
  }

  function handleRowChange(row: Row, rawValue: string) {
    if (!file || file.data === null) return;
    const clone = structuredClone(file.data);
    setAtPath(clone, row.path, coerce(rawValue, row.type));
    applyData(clone);
  }

  function handleDelete(row: Row) {
    if (!file || file.data === null) return;
    const clone = structuredClone(file.data);
    removeAtPath(clone, row.path);
    applyData(clone);
  }

  function handleDuplicate(row: Row) {
    if (!file || file.data === null) return;
    const clone = structuredClone(file.data);
    // duplicate the array element that CONTAINS this leaf (nearest array ancestor)
    let path = row.path;
    while (path.length > 0 && !isArrayElement(clone, path)) path = path.slice(0, -1);
    if (path.length === 0) return;
    duplicateElement(clone, path);
    applyData(clone);
  }

  async function handleSave() {
    if (!file) return;
    try {
      const contents =
        file.data !== null && isStructured(file.format)
          ? stringifyContent(file.format, file.data, file.raw)
          : file.raw;
      const backup = await writeFile(file.path, contents, backupOnSave);
      setFile({ ...file, raw: contents });
      setDirty(false);
      setStatus(backup ? `Saved · backup: ${basename(backup)}` : "Saved (no backup).");
    } catch (e) {
      setStatus("Save failed: " + msg(e));
    }
  }

  function saveSettings() {
    setApiKey(keyInput);
    setModel(model);
    setShowSettings(false);
    setStatus("AI settings saved locally on this machine.");
  }

  async function runAI(question: string) {
    if (!file) return setStatus("Open a file first.");
    setAiBusy(true);
    setAiOutput("");
    try {
      const prompt = `${question}\n\n--- FILE (${file.format}, ${basename(file.path)}) ---\n${buildContext(file)}`;
      setAiOutput(await askAI(SYSTEM_PROMPT, prompt));
    } catch (e) {
      if (e instanceof NoKeyError) {
        setShowSettings(true);
        setStatus("Add your Anthropic API key to use the AI panel.");
      } else {
        setAiOutput("Error: " + msg(e));
      }
    } finally {
      setAiBusy(false);
    }
  }

  const visibleRows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter(
      (r) => r.label.toLowerCase().includes(f) || String(r.value).toLowerCase().includes(f)
    );
  }, [rows, filter]);

  const showTable = Boolean(file && file.data !== null && rows.length > 0);
  const showRaw = Boolean(file && !showTable);

  return (
    <div className="module-editor">
      <div className="subbar">
        <button className="btn" onClick={handleOpen}>Open file…</button>
        <button className="btn primary" onClick={handleSave} disabled={!file || !dirty}>
          Save{dirty ? " *" : ""}
        </button>
        <button className="btn" onClick={undo} disabled={past.length === 0} title="Undo">Undo</button>
        <button className="btn" onClick={redo} disabled={future.length === 0} title="Redo">Redo</button>
        <label className="check" title="Copy the original to a .modforge-bak file before saving">
          <input type="checkbox" checked={backupOnSave} onChange={(e) => setBackupOnSave(e.target.checked)} />
          Backup on save
        </label>
      </div>

      <div className="main">
        <section className="editor">
          {!file && (
            <div className="empty">
              <p>No file open.</p>
              <button className="btn primary" onClick={handleOpen}>Open a config / save file</button>
              <p className="hint">JSON · INI · TOML · YAML · XML · CSV edit as fields. Anything else opens raw / hex.</p>
            </div>
          )}

          {file && (
            <div className="filebar">
              <span className={`badge fmt-${file.format}`}>{file.format}</span>
              <span className="fname" title={file.path}>{basename(file.path)}</span>
              <span className="fsize">{file.size.toLocaleString()} bytes</span>
              {file.parseError && <span className="warn" title={file.parseError}>⚠ parse failed — raw mode</span>}
            </div>
          )}

          {showTable && (
            <>
              <input className="filter" placeholder="Filter fields…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <div className="tablewrap">
                <table className="fields">
                  <thead>
                    <tr><th>Field</th><th>Value</th><th>Type</th><th></th></tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr key={row.label}>
                        <td className="path" title={row.label}>{row.label}</td>
                        <td>
                          {row.type === "boolean" ? (
                            <input type="checkbox" checked={row.value === true}
                              onChange={(e) => handleRowChange(row, e.target.checked ? "true" : "false")} />
                          ) : (
                            <input className="valinput" value={row.value === null ? "" : String(row.value)}
                              onChange={(e) => handleRowChange(row, e.target.value)} />
                          )}
                        </td>
                        <td className="type">{row.type}</td>
                        <td className="rowops">
                          <button className="iconbtn" title="Duplicate nearest array item" onClick={() => handleDuplicate(row)}>⧉</button>
                          <button className="iconbtn danger" title="Delete this field" onClick={() => handleDelete(row)}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {showRaw && file && (
            <textarea className="raw" value={file.raw} readOnly={file.isBinary} spellCheck={false}
              onChange={(e) => { setFile({ ...file, raw: e.target.value }); setDirty(true); }} />
          )}
        </section>

        <aside className="ai">
          <div className="ai-head">
            <strong>AI assistant</strong>
            <button className="link" onClick={() => setShowSettings((s) => !s)}>{showSettings ? "close" : "settings"}</button>
          </div>

          {showSettings && (
            <div className="ai-settings">
              <label>Anthropic API key</label>
              <input type="password" placeholder="sk-ant-…" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
              <label>Model</label>
              <select value={model} onChange={(e) => setModelState(e.target.value)}>
                {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <button className="btn primary" onClick={saveSettings}>Save settings</button>
              <p className="hint">Stored locally on this PC. Key from console.anthropic.com.</p>
            </div>
          )}

          <div className="ai-actions">
            <button className="btn" disabled={!file || aiBusy}
              onClick={() => runAI("Explain what the key fields in this file do, and flag anything risky to change.")}>
              Explain this file
            </button>
            <button className="btn" disabled={!file || aiBusy}
              onClick={() => runAI("Suggest 3 concrete, safe edits a modder might want here, with exact field paths and values.")}>
              Suggest edits
            </button>
          </div>

          <div className="ai-ask">
            <textarea placeholder="Ask about a field, e.g. 'what does maxSpeedKnots control?'"
              value={aiQuestion} onChange={(e) => setAiQuestion(e.target.value)} />
            <button className="btn primary" disabled={!file || aiBusy || !aiQuestion.trim()} onClick={() => runAI(aiQuestion)}>
              {aiBusy ? "Thinking…" : "Ask"}
            </button>
          </div>

          <div className="ai-output">
            {aiBusy && <div className="spin">Contacting AI…</div>}
            {!aiBusy && aiOutput && <pre>{aiOutput}</pre>}
            {!aiBusy && !aiOutput && <div className="hint">Open a file, then ask or hit “Explain this file.”</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}
