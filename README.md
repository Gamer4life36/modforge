# ⚒ ModForge — AI Mod & Asset Toolkit

**A free desktop toolkit for gamers, modders, and tinkerers.** Find and edit the
values in your **offline** game saves as clean, labelled fields — money, health,
resources, gems — convert config formats, decode crash logs, plan builds, and pull
saves straight off an Android device over USB. One app, eight tools, and your files
never leave your machine.

> Windows desktop app built with Tauri (Rust + React). Small, fast, offline-first.

---

## ✨ What's inside (8 modules)

| Tab | What it does |
|-----|--------------|
| **Editor** | Open any JSON · INI · TOML · YAML · XML · CSV file (or view binaries as hex) and edit every setting as a field — no hand-editing text. Undo/redo, delete, duplicate, and an **automatic backup before every save**. |
| **Trainer** | Point it at a game save (JSON / XML / INI / **SQLite**) and it **auto-scans for editable numbers**, sorts them into groups (Currency, Health, Resources, Stats…), and lets you type a new value or hit **Max**. Every change is backed up first. |
| **Device** | Connect an Android phone/tablet over USB and, in one click, **find the game that's running, stop it, and list its save files**. Pull a save → it opens in the Trainer → edit → **push it back**. |
| **Database** | Browse and edit **SQLite** save databases table-by-table — see every table, row, and cell, and change values in place. |
| **Converter** | Convert a config between JSON ⇄ YAML ⇄ TOML ⇄ INI ⇄ XML ⇄ CSV. Auto-detects the source format. Copy or save the result. |
| **Log Explainer** | Paste a crash log or stack trace → the AI returns a plain-English **Cause → Fix → Why**. |
| **Planner** | Build/loadout planner: add parts with cost & value, see live totals vs a budget, efficiency per part, and get an **AI build review**. |
| **Tracker** | Log progress entries (category, value, note) → totals, personal best, and a **day streak**, plus an **AI trend analysis**. Saved locally. |

All modules share one core engine, one AI client, and one window.

---

## ✅ What ModForge is for (please read)

ModForge is for **single-player, offline games you own**, edited on **your own
device, for your own use**. That's it — skipping a grind in a game you already paid
for or downloaded for free.

**It is deliberately *not* a tool for:**

- **Online / multiplayer / competitive games** — editing those affects other players
  and is cheating. Don't.
- **Faking in-app purchases.** ModForge edits *gameplay values* (the coins and
  resources you earn by playing). It is not for forging "purchased product" records to
  unlock paid features — remove-ads, premium skins, paid upgrades, etc. If a developer
  sells something, buy it or do without it; don't fake owning it.
- **Anything you'd redistribute.** Keep your edited saves to yourself.

Editing your own offline save is your call. Circumventing a paywall or ruining an
online game for others isn't what this project is here to help with.

---

## 🎮 Flagship workflow — edit an Android game save over USB

This is the end-to-end path most people want. Example: bump the resources in an
offline mobile builder game.

### 1. One-time phone setup

1. On the phone/tablet: **Settings → About → tap "Build number" 7 times** to unlock
   **Developer options**.
2. **Settings → Developer options → turn on "USB debugging."** While you're there,
   turn on **"Stay awake"** (stops the connection dropping when the screen sleeps).
3. Plug the device into your PC with a USB cable. Set the USB mode to **File Transfer
   / MTP**. On the phone, tap **Allow** on the *"Allow USB debugging?"* prompt and tick
   **"Always allow from this computer."**

### 2. Make sure ADB is installed

The **Device** tab drives Google's `adb` tool. Install **Android platform-tools**
(from [developer.android.com/tools/releases/platform-tools](https://developer.android.com/tools/releases/platform-tools))
and either add it to your `PATH` or drop `adb.exe` where ModForge can find it. Verify
with `adb devices` — your device should appear as `device` (not `unauthorized`).

### 3. Grab, edit, push

1. Open your game **on the phone** so it's the foreground app.
2. In ModForge, go to the **Device** tab → **🎮 Grab current game.** It detects the
   running package, **force-stops it** (so it can't overwrite your edits), and lists
   its save files.
3. Click a save file → it's pulled to your PC and **opens automatically in the
   Trainer**.
4. In the **Trainer**, use the search box to find a value you can see in-game (type
   `500` if you have 500 of something), or browse the grouped list. Type the new number
   or hit **Max**. Each edit writes a **timestamped backup** next to the file.
5. Back on the **Device** tab, click **⤴ Push edited save back.** Reopen the game —
   your new values are there.

> **Tip:** if the game was already running in the background, swipe it away after the
> push so it reloads the edited save from disk instead of re-saving the old one over it.

> **Rooted device?** Saves tucked away in `/data/data/<package>/` need root (`su`).
> Most casual games keep their save in `/sdcard/Android/data/<package>/files/`, which
> needs **no root** — that's the common, supported case.

---

## 🖥 Editing a PC game save

No phone needed:

- **Trainer** → *Open game save…* → pick a JSON / XML / INI / SQLite save → edit the
  numbers → done (backup made automatically).
- **Database** → open a `.db` / `.sqlite` save to edit specific tables and rows.
- **Editor** → for config files where you want to see and change *every* field, not
  just numbers.

---

## 🔒 Your data stays yours

- Files are read and written **only on your PC** (and, for the Device tab, over your
  own USB cable to your own device).
- **Every save makes a timestamped backup** (`yourfile.ext.modforge-bak-<time>`) first,
  so you can always roll back.
- The AI features are **optional** and only send the file/text you're working on to
  Anthropic when *you* click an AI button, using *your own* API key (stored locally).

---

## ⬇️ Download & Install (Windows)

1. Grab the latest **`ModForge_x.x.x_x64-setup.exe`** from the
   [Releases](../../releases) page.
2. Double-click it. It installs per-user (no admin needed) and adds a Start-Menu shortcut.
3. **SmartScreen warning?** Because the app isn't code-signed yet, Windows may show
   *"Windows protected your PC."* Click **More info → Run anyway**. (This is normal for
   new indie apps; it goes away once the app is signed.)

Prefer no install? A portable **`ModForge.exe`** is attached to each release too.

**For the Device tab** you'll also need **adb** (Android platform-tools) — see the
Android workflow above.

---

## 🤖 Turning on the AI features (optional)

1. Get an API key from **https://console.anthropic.com** (Settings → API Keys).
2. In ModForge, open the **Editor** tab → **AI assistant → settings**.
3. Paste your key, pick a model, **Save**. The key is stored locally on your machine.

No key? Everything except the AI buttons works exactly the same.

---

## 🚀 Quick start (per module)

- **Editor:** *Open file…*, edit the fields, **Save** (auto-backup).
- **Trainer:** *Open game save…* (or hand-off from Device), edit numbers / **Max**.
- **Device:** *Grab current game* → click a save → edit → *Push edited save back*.
- **Database:** open a SQLite save, pick a table, edit cells.
- **Converter:** load a file, choose the target format, **Convert**.
- **Log Explainer:** paste a crash log, **Explain error**.
- **Planner / Tracker:** start adding rows — they save themselves.

A step-by-step **PDF user guide** (beginner-friendly) is included in the release assets.

---

## 🛠 Build from source

Requires [Node.js](https://nodejs.org) 20+ and the [Rust toolchain](https://rustup.rs)
(plus the MSVC C++ build tools on Windows).

```bash
git clone https://github.com/Gamer4life36/modforge.git
cd modforge
npm install
npm run tauri dev      # run in dev mode
npm run tauri build    # produce a release installer in src-tauri/target/release/bundle
```

---

## 🧱 Tech stack

- **Tauri 2** (Rust backend, tiny binaries, native file access)
- **React + TypeScript + Vite** (UI)
- **rusqlite** (bundled SQLite — no external DLL) for save databases
- **adb** (Android platform-tools) for the Device tab
- **Anthropic API** (optional AI features)
- Format parsers: `ini`, `smol-toml`, `yaml`, `fast-xml-parser`

---

## 🗺 Roadmap

- Backups browser + one-click restore
- More save formats in the Trainer's auto-scan (Unity `PlayerPrefs`, protobuf)
- Array/section add in the Editor for more formats
- Game-specific presets for the Planner
- Charts in the Tracker
- Code-signing + auto-update

---

## 🤝 Contributing

Issues and pull requests welcome. If ModForge helped you, a ⭐ on the repo helps others find it.

## 📄 License

MIT — see [LICENSE](LICENSE). Free to use, modify, and share.
