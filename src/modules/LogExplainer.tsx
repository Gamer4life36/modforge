import { useState } from "react";
import { pickFile, readFile } from "../lib/tauri-io";
import { askAI, NoKeyError } from "../lib/ai";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const LOG_SYSTEM =
  "You are a crash/error-log analyst for gamers, modders, and developers. Given a " +
  "log or stack trace, identify the SINGLE most likely root cause, explain it in plain " +
  "language, and give concrete fix steps. If the log points to a specific file, line, " +
  "mod, plugin, or missing dependency, name it. If it's ambiguous, say what extra info " +
  "would disambiguate. Be concise and practical. Structure: **Cause**, **Fix**, **Why**.";

export default function LogExplainer({ setStatus }: { setStatus: (s: string) => void }) {
  const [log, setLog] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadLog() {
    try {
      const path = await pickFile();
      if (!path) return;
      const res = await readFile(path);
      // logs can be huge — keep the tail, where the crash usually is
      const LIMIT = 16000;
      const text = res.text.length > LIMIT ? "… (earlier lines trimmed) …\n" + res.text.slice(-LIMIT) : res.text;
      setLog(text);
      setStatus(`Loaded ${path.split(/[\\/]/).pop()} (${res.size.toLocaleString()} bytes)`);
    } catch (e) {
      setStatus("Load failed: " + msg(e));
    }
  }

  async function explain() {
    if (!log.trim()) return;
    setBusy(true);
    setOutput("");
    try {
      const LIMIT = 16000;
      const clipped = log.length > LIMIT ? "… (trimmed) …\n" + log.slice(-LIMIT) : log;
      setOutput(await askAI(LOG_SYSTEM, `Diagnose this log:\n\n${clipped}`));
      setStatus("Log analyzed.");
    } catch (e) {
      if (e instanceof NoKeyError) {
        setOutput("");
        setStatus("Add your Anthropic API key in the Editor tab's AI settings first.");
      } else {
        setOutput("Error: " + msg(e));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="module-logs">
      <div className="subbar">
        <button className="btn" onClick={loadLog}>Load log file…</button>
        <button className="btn primary" onClick={explain} disabled={!log.trim() || busy}>
          {busy ? "Analyzing…" : "Explain error"}
        </button>
        <div className="spacer" />
        <button className="btn" onClick={() => { setLog(""); setOutput(""); }} disabled={!log && !output}>
          Clear
        </button>
      </div>

      <div className="conv-panes">
        <div className="conv-pane">
          <div className="conv-label">Paste crash / error log</div>
          <textarea
            className="raw"
            placeholder="Paste a stack trace, crash log, or console error here — or Load log file…"
            value={log}
            spellCheck={false}
            onChange={(e) => setLog(e.target.value)}
          />
        </div>
        <div className="conv-pane">
          <div className="conv-label">Diagnosis</div>
          <div className="ai-output logout">
            {busy && <div className="spin">Analyzing the log…</div>}
            {!busy && output && <pre>{output}</pre>}
            {!busy && !output && (
              <div className="hint">
                Paste a log and hit “Explain error.” Uses the Anthropic key you set in the
                Editor tab.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
