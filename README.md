# ⚒ ModForge — AI Mod & Asset Toolkit

**A free desktop toolkit for gamers, modders, and tinkerers.** Open and edit game
config/save files as clean fields, convert between formats, decode crash logs,
plan builds, and track progress — with an AI assistant built in. One app, five tools,
your files stay on your machine.

> Windows desktop app built with Tauri (Rust + React). Small, fast, offline-first.

---

## ✨ What's inside (5 modules)

| Tab | What it does |
|-----|--------------|
| **Editor** | Open any JSON · INI · TOML · YAML · XML · CSV file (or view binaries as hex) and edit every setting as a field — no hand-editing text. Undo/redo, delete, duplicate, and an **automatic backup before every save**. |
| **Converter** | Convert a config between JSON ⇄ YAML ⇄ TOML ⇄ INI ⇄ XML ⇄ CSV. Auto-detects the source format. Copy or save the result. |
| **Log Explainer** | Paste a crash log or stack trace → the AI returns a plain-English **Cause → Fix → Why**. |
| **Planner** | Build/loadout planner: add parts with cost & value, see live totals vs a budget, efficiency per part, and get an **AI build review**. |
| **Tracker** | Log progress entries (category, value, note) → totals, personal best, and a **day streak**, plus an **AI trend analysis**. Saved locally. |

All five share one core engine, one AI client, and one window.

---

## 🔒 Your data stays yours

- Files are read and written **only on your PC**.
- **Every save makes a timestamped backup** (`yourfile.ext.modforge-bak-<time>`) first.
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

---

## 🤖 Turning on the AI features (optional)

1. Get an API key from **https://console.anthropic.com** (Settings → API Keys).
2. In ModForge, open the **Editor** tab → **AI assistant → settings**.
3. Paste your key, pick a model, **Save**. The key is stored locally on your machine.

No key? Everything except the AI buttons works exactly the same.

---

## 🚀 Quick start

- **Editor:** click *Open file…*, pick a config/save, edit the fields, click **Save**
  (a backup is made automatically).
- **Converter:** paste or load a file, choose the target format, click **Convert**.
- **Log Explainer:** paste a crash log, click **Explain error**.
- **Planner / Tracker:** just start adding rows — they save themselves.

A step-by-step **PDF user guide** (beginner-friendly) is included in the release assets.

---

## 🛠 Build from source

Requires [Node.js](https://nodejs.org) 20+ and the [Rust toolchain](https://rustup.rs)
(plus the MSVC C++ build tools on Windows).

```bash
git clone <your-repo-url>
cd modforge
npm install
npm run tauri dev      # run in dev mode
npm run tauri build    # produce a release installer in src-tauri/target/release/bundle
```

---

## 🧱 Tech stack

- **Tauri 2** (Rust backend, tiny binaries, native file access)
- **React + TypeScript + Vite** (UI)
- **Anthropic API** (optional AI features)
- Format parsers: `ini`, `smol-toml`, `yaml`, `fast-xml-parser`

---

## 🗺 Roadmap

- Backups browser + one-click restore
- Array/section add in the Editor for more formats
- Game-specific presets for the Planner
- Charts in the Tracker
- Code-signing + auto-update

---

## 🤝 Contributing

Issues and pull requests welcome. If ModForge helped you, a ⭐ on the repo helps others find it.

## 📄 License

MIT — see [LICENSE](LICENSE). Free to use, modify, and share.
