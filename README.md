# Cove

Mac notch workspace: persistent clipboard, auto-sorted by type, plus tasks, focus, notes, and calendar in the same island.

## Features

- **Dynamic Island** — spring-animated notch (idle → hover-peek → expanded) with live-activity pills: focus countdown, clip-landed, recording waveform, secret-blocked, agent usage. Model is pure + unit-tested (`src/island/`).
- **Clipboard** — auto-categorized clips (11 kinds), color auto-naming (hex/rgb/hsl → nearest named color), OCR search in screenshots, secret/credential detection that never stores.
- **Skins** — Glass / Dark / Light / Mat, switchable and persisted (`data-skin` on root).
- **Moodboard** — select image clips → one grid-composited image.
- **Remove background** (native) — Apple Vision cutout via the ✂ action on image clips.
- **Productivity** — tasks, focus timer (lives in the notch), daily notepad with ⌘↩ line→task, weekly insights.
- **Real Apple Calendar** (native) — upcoming events via EventKit (read-only).
- **Agents** (native) — live Claude Code / Cursor / Codex usage in the island.
- **Backup** — JSON export/import; IndexedDB blob storage with quota-safe writes and orphan pruning.

Tests: `npm test` (Vitest — pure island/color/storage/moodboard logic).

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173

Hover the notch, or press Option-N. Copy the desk stickers to see clips land already categorized. Secrets are detected and never stored. History lives in localStorage on this machine.

Paste a screenshot into Cove, or drop an image on the window. On a Mac, Control-Command-Shift-4 copies a screenshot to the clipboard (Command-Shift-4 saves a file to Desktop and is ignored on purpose).

## Mac app

Tiny always-on-top WKWebView. Reads the pasteboard only when it changes (~2 Hz). Does not inject into other apps.

```bash
npm run desktop   # live
npm run dmg       # Cove.app + .dmg
```

Unsigned local build: right-click Cove.app → Open. The dmg lands in `src-tauri/target/release/bundle/dmg/`.
