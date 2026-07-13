import { useState } from "react";
import { pickFile, readFile, pickSavePath, writeFile } from "../lib/tauri-io";
import { detectFormat, type Format } from "../core/detect";
import { parseContent, stringifyContent } from "../core/formats";

const FORMATS: Format[] = ["json", "yaml", "toml", "ini", "xml", "csv"];
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const EXT: Record<string, string> = {
  json: "json", yaml: "yaml", toml: "toml", ini: "ini", xml: "xml", csv: "csv",
};

export default function Converter({ setStatus }: { setStatus: (s: string) => void }) {
  const [input, setInput] = useState("");
  const [source, setSource] = useState<Format>("json");
  const [target, setTarget] = useState<Format>("yaml");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [autoSource, setAutoSource] = useState(true);

  function onInputChange(text: string) {
    setInput(text);
    if (autoSource && text.trim()) {
      const f = detectFormat("", text, false);
      if (FORMATS.includes(f)) setSource(f);
    }
  }

  async function loadFile() {
    try {
      const path = await pickFile();
      if (!path) return;
      const res = await readFile(path);
      setAutoSource(true);
      onInputChange(res.text);
      const f = detectFormat(res.path, res.text, res.is_binary);
      if (FORMATS.includes(f)) setSource(f);
      setStatus(`Loaded ${path.split(/[\\/]/).pop()} into converter`);
    } catch (e) {
      setError("Load failed: " + msg(e));
    }
  }

  function convert() {
    setError("");
    setOutput("");
    const parsed = parseContent(source, input);
    if (!parsed.ok) {
      setError(`Could not parse as ${source.toUpperCase()}: ${parsed.error}`);
      return;
    }
    try {
      setOutput(stringifyContent(target, parsed.data, input));
      setStatus(`Converted ${source.toUpperCase()} → ${target.toUpperCase()}`);
    } catch (e) {
      setError(`Could not write ${target.toUpperCase()}: ${msg(e)}`);
    }
  }

  async function copyOut() {
    await navigator.clipboard.writeText(output);
    setStatus("Copied converted output to clipboard.");
  }

  async function saveOut() {
    try {
      const path = await pickSavePath(`converted.${EXT[target] ?? target}`);
      if (!path) return;
      await writeFile(path, output, false);
      setStatus(`Saved converted file to ${path.split(/[\\/]/).pop()}`);
    } catch (e) {
      setError("Save failed: " + msg(e));
    }
  }

  return (
    <div className="module-converter">
      <div className="subbar">
        <button className="btn" onClick={loadFile}>Load file…</button>
        <span className="conv-arrow">
          <select
            value={source}
            onChange={(e) => { setAutoSource(false); setSource(e.target.value as Format); }}
          >
            {FORMATS.map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
          </select>
          <label className="check">
            <input type="checkbox" checked={autoSource} onChange={(e) => setAutoSource(e.target.checked)} /> auto
          </label>
          <span className="arrow">→</span>
          <select value={target} onChange={(e) => setTarget(e.target.value as Format)}>
            {FORMATS.map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
          </select>
        </span>
        <button className="btn primary" onClick={convert} disabled={!input.trim()}>Convert</button>
        <div className="spacer" />
        <button className="btn" onClick={copyOut} disabled={!output}>Copy</button>
        <button className="btn" onClick={saveOut} disabled={!output}>Save as…</button>
      </div>

      <div className="conv-panes">
        <div className="conv-pane">
          <div className="conv-label">Input · {source.toUpperCase()}</div>
          <textarea
            className="raw"
            placeholder="Paste config here, or Load file…"
            value={input}
            spellCheck={false}
            onChange={(e) => onInputChange(e.target.value)}
          />
        </div>
        <div className="conv-pane">
          <div className="conv-label">Output · {target.toUpperCase()}</div>
          <textarea className="raw" readOnly value={output} spellCheck={false} placeholder="Converted output appears here." />
        </div>
      </div>

      {error && <div className="conv-error">⚠ {error}</div>}
    </div>
  );
}
