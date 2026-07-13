# 🚀 ModForge Launch Kit

Everything you need to announce ModForge. Replace `<YOUR GITHUB LINK>` with your
**Releases** page URL before posting (e.g. `https://github.com/<you>/modforge/releases`).

> **Post order:** GitHub (home base) → record the GIF → Reddit + the target game's
> modding community/Discord → Nexus → itch.io / Show HN. Don't blast every platform
> the same hour; space them out and reply to early comments.

---

## 1. Reddit

### Title (pick one)
1. `I built ModForge — a free, open-source desktop app that edits game config & save files as simple fields (with automatic backups + an AI helper)`
2. `Made a free 5-in-1 toolkit for modders: edit configs/saves safely, convert formats, decode crash logs, plan builds`
3. `ModForge: turn messy game config/save files into an editable form — free & open source`

### Body (Reddit markdown)
```markdown
I kept hand-editing game config and save files in Notepad and breaking things, so I built a tool that does it safely. Sharing it in case it helps someone else.

**ModForge** is a free, open-source Windows app. Five tools in one window:

- **Editor** – opens JSON / INI / TOML / YAML / XML / CSV (or hex for binaries) and shows every setting as an editable field. Undo/redo, and it **makes a timestamped backup before every save** so you can't permanently break anything.
- **Converter** – convert a config between any of those formats.
- **Log Explainer** – paste a crash log, get a plain-English *Cause → Fix → Why*.
- **Planner** – plan a build/loadout with cost vs value against a budget.
- **Tracker** – log progress (runs, playtime, drops…) with totals and a day streak.

Your files never leave your PC. The AI features are optional and only run when *you* click them, using your own API key.

Built with Tauri (Rust + React), so it's a ~2 MB install and fast.

**Download / source:** <YOUR GITHUB LINK>
There's also a beginner-friendly PDF guide in the release.

Heads-up: it's not code-signed yet, so Windows SmartScreen will say "unrecognized app" — click *More info → Run anyway*. It's early (v0.4), so I'd love feedback on what to add or which file formats/games to support next.
```

### Where to post (1–2 at a time; read each sub's rules first)
- **r/SideProject**, **r/coolgithubprojects** — made-a-thing subs, very receptive
- **r/opensource** — lead with open-source + local-privacy angle
- **r/modding** — core audience
- **The specific game's modding subreddit / Discord** — highest conversion; name that game in the title there
- Softer fits: **r/software**, **r/pcgaming** (many restrict self-promo to a weekly thread)

### Tips
- Attach a **GIF** (see §3) — 3–5×'s engagement.
- Use the "Show & Tell / I made this" flair.
- Put the caption (§4) as the post body **and** pin it as your first comment.
- Reply to every early comment — that's what feeds the algorithm.

---

## 2. Nexus Mods

**Where:** Nexus lists tools under a *specific game*. Upload under that game's
**Utilities / Tools** (e.g. "Modding Tools") category. Repeat per game later.

**Title:** `ModForge — AI Mod & Asset Toolkit (config/save editor + converter + crash-log explainer)`

**Description (Nexus BBCode):**
```
[b]ModForge[/b] is a free, open-source desktop toolkit for editing game config and save files safely — no coding required.

[b][size=4]What it does[/size][/b]
[list]
[*][b]Editor[/b] — opens JSON, INI, TOML, YAML, XML, and CSV files and shows every setting as an editable field. Undo/redo, duplicate, delete, and an [b]automatic timestamped backup before every save[/b].
[*][b]Converter[/b] — convert a config between any of those formats.
[*][b]Log Explainer[/b] — paste a crash log and get a plain-English cause and fix (optional AI).
[*][b]Planner[/b] — plan builds/loadouts with cost vs value against a budget.
[*][b]Tracker[/b] — log progress with totals, personal best, and streaks.
[/list]

[b][size=4]Why it's safe[/size][/b]
[list]
[*]Your files never leave your PC.
[*]Every save is backed up first (yourfile.ext.modforge-bak-...), so you can always roll back.
[*]AI features are optional and only run when you click them, using your own API key.
[/list]

[b][size=4]Requirements[/size][/b]
64-bit Windows 10/11. No admin needed. ~2 MB.

[b][size=4]Installation[/size][/b]
1. Download and run ModForge_x.x.x_x64-setup.exe (a portable .exe is also provided).
2. If Windows SmartScreen appears (the app isn't code-signed yet), click "More info" then "Run anyway".
3. Open ModForge, then Open a config/save file to begin.

A full beginner's PDF guide is included in the downloads.

[b]Source code & issues:[/b] <YOUR GITHUB LINK>
[b]License:[/b] MIT (free to use, modify, and share).
```

**Notes:** set category to a **Utility/Tool**, add 2–3 screenshots, and in **File
permissions** allow redistribution to match the MIT license.

---

## 3. 15-second demo GIF — recording script

### Prep (2 min)
- **Tool:** ScreenToGif (free, screentogif.com). ShareX or Xbox Game Bar also work.
- **Window:** open ModForge, default size (~1100×720), clean background, close other windows.
- **Reset state:** be on the **Editor** tab, no file open; delete old
  `samples\ship_config.json.modforge-bak-…` files so exactly one backup appears;
  the demo file `maxSpeedKnots` is set to `26`.
- **Cursor:** move deliberately — no wandering.

### Shot list (~15s)
| Time | Action |
|---|---|
| 0:00–0:01 | Editor **empty state**, hold 1 beat |
| 0:01–0:03 | Click **Open file…** → double-click **ship_config.json** |
| 0:03–0:04 | Let fields appear, hold 1 beat |
| 0:04–0:05 | Click **Filter**, type `speed` |
| 0:05–0:08 | Click **maxSpeedKnots** (`26`), select all, type **80** |
| 0:08–0:09 | Click **Save** |
| 0:09–0:11 | Pause on the status bar: `Saved · backup: …modforge-bak-…` |
| 0:11–0:14 | Click tabs left→right: Converter → Log Explainer → Planner → Tracker |
| 0:14–0:15 | Land back on **Editor**, hold 1 beat |

### Export
- Crop tight to the window (no taskbar/desktop). 15 fps. Loop forever.
- Add ~1s pause on the last frame before it loops. Target < ~5 MB for inline embeds.

### Golden rules
- No dead air — a clean 12s beats a messy 18s.
- The **status-bar backup line (0:09–0:11) is the money shot** — keep it readable.
- Variant: at 0:09, Alt-Tab to a File Explorer on the `samples` folder to show the
  backup file *appear*. Pick one: breadth (tabs) or trust (backup). First post → trust.

---

## 4. Captions

### Main (Reddit first comment / under the GIF)
```
What you're seeing: open a game config, change one value (26 → 80), hit Save — and ModForge drops a timestamped backup first, so you literally can't break the file. That's the whole idea: mod fearlessly.

It's a free, open-source Windows app (~2 MB) with 5 tools in one: config/save editor, format converter, crash-log explainer, build planner, and progress tracker.

Download + source + a beginner PDF guide: <YOUR GITHUB LINK>
Early build — tell me what formats or games to support next.
```

### X / Twitter
```
Editing game files in Notepad and breaking them? I built ModForge.

Open a config → change a value → Save. It backs up the original first, so you can't brick it. Free & open source, 5 tools in one ~2 MB app.

⬇️ <LINK> #gamedev #modding
```

### Discord
```
Made a free tool for editing game config/save files as simple fields — auto-backs up before every save so you can't break anything. Also does format conversion, crash-log decoding, build planning + tracking. Open source: <LINK>
```

### Nexus image caption
```
Open a config, change a value, Save — ModForge backs up the original automatically first. Safe, field-based editing for JSON/INI/TOML/YAML/XML/CSV.
```

---

## 5. Pre-launch checklist
- [ ] GitHub repo pushed and **public**
- [ ] Release **v0.4.0** created with `ModForge_0.4.0_x64-setup.exe` + `ModForge_User_Guide.pdf` attached
- [ ] `<YOUR GITHUB LINK>` replaced everywhere above (point at the **Releases** page)
- [ ] Demo **GIF** recorded and under ~5 MB
- [ ] 2–3 screenshots ready (Editor, Converter, one more)
- [ ] Read the rules of each subreddit before posting
- [ ] Post, then **reply to early comments** within the first hour
