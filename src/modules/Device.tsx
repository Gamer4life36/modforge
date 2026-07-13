import { useState } from "react";
import { adbRun, pickFile, pickSavePath } from "../lib/tauri-io";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function Device({ setStatus }: { setStatus: (s: string) => void }) {
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [cmd, setCmd] = useState("");
  const [remote, setRemote] = useState("/sdcard/Android/data/<package>/files/save.db");

  async function run(args: string[], label: string) {
    setBusy(true);
    try {
      const res = await adbRun(args);
      setOut(`$ adb ${args.join(" ")}\n${res}`);
      setStatus(label);
    } catch (e) {
      setOut("Error: " + msg(e));
      setStatus("adb error — is adb installed and on PATH?");
    } finally {
      setBusy(false);
    }
  }

  async function pull() {
    const dest = await pickSavePath(remote.split("/").pop() || "save.db");
    if (!dest) return;
    await run(["pull", remote, dest], "Pulled save from device.");
  }

  async function push() {
    const src = await pickFile();
    if (!src) return;
    await run(["push", src, remote], "Pushed save to device.");
  }

  function runRaw() {
    const args = cmd.trim().split(/\s+/).filter(Boolean);
    if (args.length) run(args, "Ran adb command.");
  }

  return (
    <div className="module-device">
      <div className="subbar">
        <button className="btn" disabled={busy} onClick={() => run(["devices"], "Listed devices.")}>
          List devices
        </button>
        <button className="btn" disabled={busy} onClick={() => run(["shell", "getprop", "ro.product.model"], "Read device model.")}>
          Device info
        </button>
        <div className="spacer" />
        {busy && <span className="spin">running…</span>}
      </div>

      <div className="device-body">
        <div className="device-row">
          <label>Save path on device</label>
          <input value={remote} onChange={(e) => setRemote(e.target.value)} spellCheck={false} />
          <button className="btn" disabled={busy} onClick={pull}>Pull to PC…</button>
          <button className="btn" disabled={busy} onClick={push}>Push file…</button>
        </div>

        <div className="device-row">
          <label>Raw adb command</label>
          <input
            value={cmd}
            placeholder='e.g.  shell su -c "cp /data/data/<pkg>/save.db /sdcard/save.db"'
            spellCheck={false}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runRaw()}
          />
          <button className="btn primary" disabled={busy || !cmd.trim()} onClick={runRaw}>Run</button>
        </div>

        <div className="ai-output" style={{ flex: 1 }}>
          <pre>{out || "Connect a device (USB debugging on) and click “List devices”.\n\nWorkflow: pull the save → edit it in the Editor or Database tab → push it back.\n\nProtected /data/data/<pkg>/ saves need a rooted device — use:\n  shell su -c \"cp /data/data/<pkg>/files/save.db /sdcard/save.db\"\nthen pull /sdcard/save.db."}</pre>
        </div>
      </div>
    </div>
  );
}
