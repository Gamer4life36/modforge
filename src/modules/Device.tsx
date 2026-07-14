import { useState } from "react";
import { adbRun, pickFile, pickSavePath, tempPath } from "../lib/tauri-io";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const base = (p: string) => p.split(/[\\/]/).pop() || p;

// Files that are likely game saves, and junk to ignore.
const INTERESTING = /\.(db|db3|sqlite|sqlite3|json|xml|sav|save|dat|bin|pref|prefs|cfg|ini)$|shared_prefs\//i;
const EXCLUDE = /\.(so|dex|apk|png|jpe?g|webp|gif|ogg|mp3|wav|ttf|otf)$|\/cache\/|\/code_cache\/|\/lib\//i;

export default function Device({
  setStatus,
  onOpen,
}: {
  setStatus: (s: string) => void;
  onOpen: (path: string) => void;
}) {
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [cmd, setCmd] = useState("");
  const [remote, setRemote] = useState("/sdcard/Android/data/<package>/files/save.db");
  const [pkg, setPkg] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [lastPull, setLastPull] = useState<{ local: string; remote: string } | null>(null);

  async function run(args: string[], label: string) {
    setBusy(true);
    try {
      const res = await adbRun(args);
      setOut(`$ adb ${args.join(" ")}\n${res}`);
      setStatus(label);
      return res;
    } catch (e) {
      setOut("Error: " + msg(e));
      setStatus("adb error — is adb installed and on PATH?");
      return "";
    } finally {
      setBusy(false);
    }
  }

  /** Detect the currently-foreground app package. */
  async function foreground(): Promise<string | null> {
    const a = await adbRun(["shell", "dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity'"]).catch(() => "");
    let m = a.match(/([a-zA-Z][\w.]+)\/[\w.]+/);
    if (!m) {
      const w = await adbRun(["shell", "dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'"]).catch(() => "");
      m = w.match(/([a-zA-Z][\w.]+)\/[\w.]+/);
    }
    return m ? m[1] : null;
  }

  /** One click: find the running game, stop it, list its save files. */
  async function grabGame() {
    setBusy(true);
    setFiles([]);
    setPkg("");
    try {
      const p = await foreground();
      if (!p) {
        setOut("Couldn't detect a foreground app. Open your game on the phone, then try again.");
        setStatus("No foreground game detected.");
        return;
      }
      setPkg(p);
      // Stop the game so it can't overwrite our edits (the classic gotcha).
      await adbRun(["shell", `am force-stop ${p}`]).catch(() => {});
      const cmdStr =
        `su -c 'find /data/data/${p} -type f 2>/dev/null'; ` +
        `find /sdcard/Android/data/${p} -type f 2>/dev/null; ` +
        `find /sdcard/Android/obb/${p} -type f 2>/dev/null`;
      const listing = await adbRun(["shell", cmdStr]).catch(() => "");
      const found = listing
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((l) => l.startsWith("/") && INTERESTING.test(l) && !EXCLUDE.test(l));
      const uniq = Array.from(new Set(found)).slice(0, 60);
      setFiles(uniq);
      setOut(
        `Game: ${p}  (stopped so it won't overwrite edits)\n` +
          (uniq.length ? `Found ${uniq.length} candidate save file(s):\n` + uniq.join("\n") : "No obvious save files found. If it's in /data/data you need root (su).")
      );
      setStatus(`Found ${uniq.length} save file(s) for ${p}.`);
    } catch (e) {
      setOut("Error: " + msg(e));
      setStatus("Grab failed — check adb / root.");
    } finally {
      setBusy(false);
    }
  }

  /** Pull a save (via su copy if it's in protected storage) and open it in the Trainer. */
  async function pullAndEdit(remoteFile: string) {
    setBusy(true);
    try {
      const local = await tempPath(base(remoteFile));
      let src = remoteFile;
      if (remoteFile.startsWith("/data/")) {
        await adbRun(["shell", `su -c 'cp "${remoteFile}" /sdcard/mf_pull.tmp && chmod 666 /sdcard/mf_pull.tmp'`]);
        src = "/sdcard/mf_pull.tmp";
      }
      await adbRun(["pull", src, local]);
      setLastPull({ local, remote: remoteFile });
      setRemote(remoteFile);
      setStatus(`Pulled ${base(remoteFile)} → opening in Trainer.`);
      onOpen(local);
    } catch (e) {
      setOut("Pull failed: " + msg(e));
    } finally {
      setBusy(false);
    }
  }

  /** Push the edited save back to where it came from (stops the game first). */
  async function pushBack() {
    if (!lastPull) return;
    const { local, remote: dest } = lastPull;
    setBusy(true);
    try {
      if (pkg) await adbRun(["shell", `am force-stop ${pkg}`]).catch(() => {});
      if (dest.startsWith("/data/")) {
        await adbRun(["push", local, "/sdcard/mf_push.tmp"]);
        await adbRun([
          "shell",
          `su -c 'cp /sdcard/mf_push.tmp "${dest}" && chown $(stat -c %U:%G "${dest}") "${dest}" 2>/dev/null; rm -f /sdcard/mf_push.tmp'`,
        ]);
      } else {
        await adbRun(["push", local, dest]);
      }
      setStatus(`Pushed edited save back to ${dest}. Reopen the game to see it.`);
      setOut(`Pushed edited save back:\n${local}\n  →  ${dest}`);
    } catch (e) {
      setOut("Push-back failed: " + msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function pull() {
    const dest = await pickSavePath(base(remote));
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
        <button className="btn primary" disabled={busy} onClick={grabGame}>🎮 Grab current game</button>
        <button className="btn" disabled={busy} onClick={() => run(["devices"], "Listed devices.")}>Devices</button>
        <button className="btn" disabled={busy || !lastPull} onClick={pushBack} title="Push the edited save back where it came from">
          ⤴ Push edited save back
        </button>
        <div className="spacer" />
        {busy && <span className="spin">running…</span>}
      </div>

      <div className="device-body">
        {files.length > 0 && (
          <div className="device-files">
            <div className="conv-label">{pkg} — click a file to pull &amp; edit</div>
            {files.map((f) => (
              <button key={f} className="file-pick" disabled={busy} onClick={() => pullAndEdit(f)} title={f}>
                {f}
              </button>
            ))}
          </div>
        )}

        <div className="device-row">
          <label>Save path on device (manual)</label>
          <input value={remote} onChange={(e) => setRemote(e.target.value)} spellCheck={false} />
          <button className="btn" disabled={busy} onClick={pull}>Pull to PC…</button>
          <button className="btn" disabled={busy} onClick={push}>Push file…</button>
        </div>

        <div className="device-row">
          <label>Raw adb command</label>
          <input
            value={cmd}
            placeholder='e.g.  shell su -c "ls /data/data/<pkg>"'
            spellCheck={false}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runRaw()}
          />
          <button className="btn primary" disabled={busy || !cmd.trim()} onClick={runRaw}>Run</button>
        </div>

        <div className="ai-output" style={{ flex: 1 }}>
          <pre>{out || "1) Phone: enable USB debugging, plug in.\n2) Open your game, then click “🎮 Grab current game”.\n   It finds the game, stops it, and lists its save files.\n3) Click a save → it pulls and opens in the Trainer.\n4) Edit, then “⤴ Push edited save back”. Reopen the game.\n\nProtected /data/data/<pkg>/ saves need a rooted device (su)."}</pre>
        </div>
      </div>
    </div>
  );
}
