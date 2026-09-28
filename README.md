# Cove

Mac notch workspace: persistent clipboard, auto-sorted by type, plus tasks, focus, notes, and calendar in the same island.

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
