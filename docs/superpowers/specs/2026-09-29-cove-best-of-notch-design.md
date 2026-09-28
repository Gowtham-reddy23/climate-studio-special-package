# Cove — Best-of-Notch Design Spec

- **Date:** 2026-09-29
- **Status:** Draft for review
- **Owner:** gowtham@altcarbon.com
- **Topic:** Enhance Cove into a best-of-NotchOwl + Tucket + codenotch macOS notch app, with a proper Dynamic Island shell.

---

## 1. Goal

Cove already exists as a Tauri v2 + React 19 + TypeScript macOS notch app with a solid native layer. This spec turns its working skeletons into a polished, cohesive product that matches (and combines) the three reference apps:

- **NotchOwl** — tasks, focus timer in the notch, daily notepad, calendar, insights.
- **Tucket** — clipboard auto-sorted by type, color naming, OCR search, boards + moodboards, remove-background, sensitive-content blocking, skins, ⌘⌃1–0 paste, 100% local.
- **codenotch** — pins AI coding-tool usage limits (Claude Code / Cursor / Codex) to a screen edge.

The work is **polish + fill-in**, not a rebuild. The Rust/native layer (notch positioning, paste hotkeys, OCR) stays; the React shell and several mock features get made real.

## 2. Current State (baseline)

Established by a read-only audit of the codebase on 2026-09-29.

- **Native (solid):** `place_notch` (NSScreen private API), `set_paste_slots` (⌘⌃1–0 global hotkeys), `ai_agents` polling, `ocr_image` (Tesseract), `quit_cove`. Window is transparent, always-on-top, undecorated, non-focusing.
- **Notch shell (partial):** expand/collapse via `open` prop toggle in `NotchDock.tsx` + `Pebble.tsx`; hover detection present; **no spring animation, no live-activity pill states**.
- **Clipboard (mostly real):** 11 clip kinds, 4 hardcoded boards, OCR on images, ⌘⌃1–0 paste, secret detection + banner. Missing: color auto-naming logic, skins, remove-bg impl, moodboard.
- **Productivity (skeletons):** Tasks (full CRUD), Focus (Pomodoro/Deep/Stopwatch, pause/+5min), Notes (per-day autosave). Calendar + Insights render but use mock/empty data. No ⌘↩ note→task.
- **Agents (stub):** polls every 4s but returns hardcoded fake agents in the web fallback; Rust side has no real usage source.
- **Audio (mostly real):** MediaRecorder + Web Speech transcript + waveform; playback UI thin.
- **Storage (fragile):** localStorage only (`cove.v3`), blobs stored as base64 → ~5MB cliff, silent failure. No IndexedDB, no export.
- **Styling:** `styles.css` (~2160 lines), polished but a single hardcoded dark theme; no skin system.

## 3. Non-Goals (YAGNI — explicitly cut for v1)

- ❌ **Phone-link pairing** (codenotch's QR phone companion).
- ❌ **Semantic/vector clip search** — text + OCR + transcript search stays; no embeddings.
- ❌ **ML auto-layout moodboard** — moodboard is a simple responsive grid paste.
- ❌ Cloud sync / multi-device. Cove stays 100% local.
- ❌ Licensing / payments.

## 4. Global Architecture Decisions

1. **Animation:** add **Framer Motion** (`motion`) for spring + shared-layout transitions. Used only for the notch shell and island pills; the rest of the CSS stays.
2. **Theming:** four skins — **Glass / Dark / Light / Mat** — driven by a `data-skin` attribute on the root element, persisted in the store. `styles.css` color tokens get extracted into per-skin CSS custom-property blocks.
3. **Storage:** blobs (images, audio) move to **IndexedDB**; the reducer store keeps only metadata + blob keys. One-time migration reads existing base64 clips into IndexedDB on first load of the new version.
4. **Native reads:** new read-only Rust commands for Apple Calendar (EventKit) and agent usage sources. No write access to user data.
5. **State model:** keep the existing reducer pattern in `store.tsx`; extend `AppState` and action types rather than replacing.

## 5. Phase 1 — Dynamic Island Engine

The centerpiece. A single state machine plus a live-activity queue, animated with Framer Motion.

### 5.1 Shell states
- `idle` — collapsed to the notch footprint; may host one live-activity pill.
- `peek` — brief hover preview: notch widens ~20%, shows a hint of contents. Enter on `onMouseEnter` after a short delay; collapse on leave.
- `expanded` — full workspace (current tabbed views). Entered on click or Option-N.

Transitions use spring config (e.g. `stiffness ~380, damping ~30`) via Framer Motion `layout` + `AnimatePresence`. `prefers-reduced-motion` falls back to short fades.

### 5.2 Live activities (collapsed-notch pills)
A priority queue of transient/persistent activities rendered in the collapsed notch:

| Activity | Trigger | Visual | Priority |
|---|---|---|---|
| `focus-timer` | Focus session running | countdown mm:ss + ring | persistent, high |
| `clip-landed` | New clip captured | icon + kind, auto-dismiss ~2.5s | transient |
| `recording` | Audio recorder active | live waveform | persistent, high |
| `secret-blocked` | Sensitive content detected | lock badge, auto-dismiss | transient, top |
| `agent-alert` | Agent usage crosses threshold | tool glyph + % | transient |

Rules: at most one persistent + one transient shown; higher priority wins the transient slot; expanding the notch pauses transient auto-dismiss. Model as `IslandActivity { id, kind, priority, payload, persistent, expiresAt? }` in a new `island` slice of the store, with a `useIsland()` hook. Existing features emit activities (focus start → `focus-timer`; clip add → `clip-landed`; recorder → `recording`; secret block → `secret-blocked`; agent poll → `agent-alert`).

### 5.3 Files
- New: `src/island/IslandState.ts` (types + reducer slice), `src/island/useIsland.ts`, `src/island/IslandPill.tsx`.
- Changed: `NotchDock.tsx` (render pills, wire Framer Motion), `Pebble.tsx`, `App.tsx` (state machine host), `styles.css` (island tokens).

### 5.4 Testing
Unit-test the priority/dismiss logic of the island reducer (pure functions). Manual: hover peek, click expand, each activity trigger, reduced-motion.

## 6. Phase 2 — Clipboard: Tucket Parity

### 6.1 Skins
Extract color tokens from `styles.css` into four `[data-skin="glass|dark|light|mat"]` blocks. Add a skin picker (settings + quick switch). Persist `skin` in store. Glass = translucent/blur; Mat = flat matte; Light/Dark = standard.

### 6.2 Color auto-naming
When a clip is a color, compute the nearest human name (curated named-color table + nearest-RGB match; no network). Store `meta.colorName`. Show name in the clip row and make it searchable.

### 6.3 Remove background
Right-click an image clip → **Remove Background**. Implement as a Rust command using Apple **Vision** (`VNGenerateForegroundInstanceMaskRequest`, macOS 14+) → returns cutout PNG stored as a new clip. Fallback: menu item disabled with tooltip if unsupported.

### 6.4 Moodboard (simple)
Multi-select image clips → **Make Moodboard** → composite into a single grid-laid-out image (fixed responsive grid, no ML), saved as a new image clip. Uses canvas compositing in the web layer.

### 6.5 Search
Extend existing search to include `colorName`, OCR text, and transcript (OCR/transcript already indexed). No vector search.

### 6.6 Files
Changed: `ClipboardView.tsx`, `lib.ts`, `styles.css`, `store.tsx`, `types.ts`. New: `src/color/namedColors.ts`, `src-tauri/src/removebg.rs` (Vision), `src/moodboard.ts`.

## 7. Phase 3 — Storage Foundation

- Extend `blobDb.ts` into a typed IndexedDB wrapper: `putBlob(key, Blob) / getBlob(key) / deleteBlob(key)`.
- Clips reference `blobKey` instead of inlining base64. Reducer stores metadata only.
- **Migration:** on load, if `cove.v3` clips contain inline base64, move them to IndexedDB, replace with keys, bump to `cove.v4`. Idempotent + guarded so it runs once.
- Add JSON **export/import** of metadata (NotchOwl offers JSON backup); blobs optionally bundled.
- Testing: migration unit test (v3 fixture → v4 + blobs present), quota-exceeded handled with a user-visible warning instead of silent loss.

## 8. Phase 4 — Productivity: NotchOwl Parity

### 8.1 Apple Calendar (read-only)
New Rust command `calendar_events(range)` via **EventKit**, requesting read Full Access; returns today's/upcoming events. `CalendarView.tsx` + `TodayView.tsx` consume real data. Graceful states: permission not granted, no notch (top-center fallback already handled by NotchOwl-style; verify Cove positioning).

### 8.2 Insights (real metrics)
Compute from existing logged data: completed tasks (with `doneAt`), focus minutes (from `FocusLog`), daily activity streak. No new storage. `InsightsCard.tsx` renders real charts (completed count, focus time, 7-day activity).

### 8.3 Note → task
In `NotesView.tsx`, **⌘↩** on the current line converts it into a task (dispatch add-task, strike the line). Small, self-contained.

### 8.4 Files
New: `src-tauri/src/calendar.rs`. Changed: `CalendarView.tsx`, `TodayView.tsx`, `InsightsCard.tsx`, `NotesView.tsx`, capabilities for calendar permission.

## 9. Phase 5 — Agents: codenotch Parity

- Replace the fake web-fallback agents with **real local reads**, per tool, with graceful fallback when a source is absent:
  - **Claude Code:** read local usage/limit state from its on-disk data (config/usage files under the user's Claude directory).
  - **Cursor / Codex:** read available local logs/state; if unavailable, mark `unknown` rather than fabricate.
- `agents.rs` returns `{ id, label, running, percent, resetAt?, detail, source: "real"|"unknown" }`.
- Surface as: `AgentsBento.tsx` (detail view) + `agent-alert` island activity when a tool crosses a usage threshold.
- No phone-link. No network calls.
- Testing: parser unit tests against sample fixtures; `unknown` path when files missing.

## 10. Data Model Changes (`types.ts`)

- `Clip`: add `blobKey?`, `meta.colorName?`, `kind: "moodboard"` variant.
- New `IslandActivity` type + `island` slice in `AppState`.
- New `skin: "glass"|"dark"|"light"|"mat"` on settings.
- `Agent`: add `resetAt?`, `source`.
- Store version bump `cove.v3` → `cove.v4` with migration.

## 11. Testing Strategy

- **Pure logic (unit):** island priority/dismiss reducer, storage migration, color-naming nearest-match, insights aggregation, agent parsers. TDD these.
- **Native:** manual verification of Vision remove-bg, EventKit read, agent file reads on the target Mac (macOS 14+, Apple silicon).
- **Manual UX pass** per phase against the reference behaviors.

## 12. Sequencing

Build in phase order 1 → 5. Each phase is independently shippable and leaves Cove working. Phase 3 (storage) should land before heavy Phase 2 image work in practice; if image volume grows during Phase 2, pull Phase 3 forward.

## 13. Open Questions

1. Exact on-disk location/format of Claude Code / Cursor / Codex usage data on this machine — to be confirmed during Phase 5 (may reduce to Claude Code only for v1).
2. Minimum macOS target — assuming **14+** (matches NotchOwl and Vision/EventKit APIs). Confirm.
3. Repo is **not** under git yet; design doc cannot be committed until `git init`. Decide whether to initialize.
