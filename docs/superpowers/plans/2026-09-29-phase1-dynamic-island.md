# Phase 1 — Dynamic Island Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Cove's ad-hoc notch glue (`islandLabel` + `mood`) with a tested live-activity queue and Framer-Motion spring animations, giving the notch a real Dynamic-Island feel.

**Architecture:** A pure, unit-tested model (`buildActivities` + `selectIsland`) turns app state into at most one *persistent* and one *transient* island pill by priority + expiry. A `useIsland` hook feeds store/recorder state in. `IslandPill` renders a pill; `NotchDock`/`App` animate the shell (`idle → peek → expanded`) and pill enter/exit with Framer Motion, respecting `prefers-reduced-motion`.

**Tech Stack:** React 19, TypeScript, Tauri v2, Framer Motion (new), Vitest (new).

**Spec:** `docs/superpowers/specs/2026-09-29-cove-best-of-notch-design.md` (§5).

## Global Constraints

- **Platform:** macOS 14+ target; Apple silicon. (spec §13)
- **Local-only:** no network calls introduced. (spec §3)
- **Non-destructive to existing behavior:** hover-peek (~70ms), key-open (⌥N), close-timer (~220ms), and all existing keyboard shortcuts must keep working. (App.tsx current behavior)
- **Reduced motion:** every animation must degrade to a short fade under `prefers-reduced-motion`. (spec §5.1)
- **Purity:** `buildActivities` and `selectIsland` must be pure — no `Date.now()` inside; `now` is passed in. (Cove already threads `now` through App.)

---

## File Structure

- `src/island/islandModel.ts` — pure types + `buildActivities` + `selectIsland`. One responsibility: state → island view.
- `src/island/islandModel.test.ts` — Vitest unit tests for the model.
- `src/island/useIsland.ts` — hook adapting store + recorder + agents into `IslandInputs`, returns `IslandView`.
- `src/island/IslandPill.tsx` — presentational pill (persistent/transient).
- `src/components/NotchDock.tsx` — MODIFY: render pills via `IslandPill` + Framer Motion `AnimatePresence`; spring the stage.
- `src/App.tsx` — MODIFY: compute `IslandView` from `useIsland`, pass to `NotchDock` and the web `island` button; wrap shell in `motion`.
- `src/types.ts` — MODIFY: export `ActivityKind`, `IslandActivity`, `IslandView` (re-export from islandModel is fine).
- `vitest.config.ts` — new test config.
- `package.json` — MODIFY: add `framer-motion`, `vitest`, and a `test` script.

---

### Task 1: Tooling — Framer Motion + Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `npm test` runs Vitest; `motion` importable from `framer-motion`.

- [ ] **Step 1: Install deps**

```bash
cd "/Users/GowthamReddy/Developer/Persistent clipboard"
npm install framer-motion
npm install -D vitest
```

- [ ] **Step 2: Add test script to package.json**

In `package.json` `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Verify Vitest runs (no tests yet)**

Run: `npm test`
Expected: exits 0 with "No test files found" (or passes with 0 tests). Framer Motion resolves: `node -e "require.resolve('framer-motion')"` prints a path.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add framer-motion and vitest tooling"
```

---

### Task 2: Island model (pure, TDD)

**Files:**
- Create: `src/island/islandModel.ts`
- Test: `src/island/islandModel.test.ts`

**Interfaces:**
- Produces:
  - `type ActivityKind = "focus-timer" | "clip-landed" | "recording" | "secret-blocked" | "agent-alert"`
  - `interface IslandActivity { id: string; kind: ActivityKind; priority: number; persistent: boolean; label: string; detail?: string; accent?: string; expiresAt?: number }`
  - `interface IslandView { persistent: IslandActivity | null; transient: IslandActivity | null; hot: boolean }`
  - `interface IslandInputs { focus: {running: boolean; mode: "pomodoro"|"deep"|"watch"; remainingMs: number; taskTitle: string | null}; recording: {active: boolean; elapsedMs: number; partial: string}; latestClip: {id: string; kind: string; preview: string; createdAt: number; accent?: string} | null; lastBlockedAt: number | null; agentAlert: {id: string; label: string; percent: number} | null }`
  - `function buildActivities(input: IslandInputs, now: number): IslandActivity[]`
  - `function selectIsland(activities: IslandActivity[], now: number): IslandView`
  - `const PRIORITY: Record<ActivityKind, number>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/island/islandModel.test.ts
import { describe, it, expect } from "vitest";
import { buildActivities, selectIsland, type IslandInputs } from "./islandModel";

const base: IslandInputs = {
  focus: { running: false, mode: "pomodoro", remainingMs: 0, taskTitle: null },
  recording: { active: false, elapsedMs: 0, partial: "" },
  latestClip: null,
  lastBlockedAt: null,
  agentAlert: null,
};

describe("buildActivities", () => {
  it("emits a persistent focus-timer while focus runs", () => {
    const acts = buildActivities({ ...base, focus: { running: true, mode: "pomodoro", remainingMs: 90_000, taskTitle: "Write" } }, 1000);
    const t = acts.find((a) => a.kind === "focus-timer");
    expect(t).toBeTruthy();
    expect(t!.persistent).toBe(true);
    expect(t!.label).toBe("1:30");
  });

  it("emits a transient clip-landed that expires ~2.5s after copy", () => {
    const acts = buildActivities({ ...base, latestClip: { id: "c1", kind: "color", preview: "#fff", createdAt: 1000, accent: "#fff" } }, 1500);
    const c = acts.find((a) => a.kind === "clip-landed");
    expect(c).toBeTruthy();
    expect(c!.persistent).toBe(false);
    expect(c!.expiresAt).toBe(1000 + 2500);
  });

  it("emits a top-priority secret-blocked pill", () => {
    const acts = buildActivities({ ...base, lastBlockedAt: 1000 }, 1200);
    expect(acts.some((a) => a.kind === "secret-blocked")).toBe(true);
  });
});

describe("selectIsland", () => {
  it("keeps at most one persistent and one transient, highest priority wins", () => {
    const now = 1000;
    const acts = buildActivities(
      {
        ...base,
        focus: { running: true, mode: "deep", remainingMs: 60_000, taskTitle: "X" }, // persistent
        recording: { active: true, elapsedMs: 5000, partial: "" }, // persistent, higher
        latestClip: { id: "c1", kind: "text", preview: "hi", createdAt: 990, accent: undefined }, // transient
        lastBlockedAt: 990, // transient, higher
      },
      now,
    );
    const view = selectIsland(acts, now);
    expect(view.persistent?.kind).toBe("recording");
    expect(view.transient?.kind).toBe("secret-blocked");
    expect(view.hot).toBe(true);
  });

  it("drops expired transient activities", () => {
    const acts = buildActivities({ ...base, latestClip: { id: "c1", kind: "text", preview: "hi", createdAt: 0, accent: undefined } }, 5000);
    const view = selectIsland(acts, 5000);
    expect(view.transient).toBeNull();
  });

  it("is not hot when nothing is active", () => {
    expect(selectIsland(buildActivities(base, 1000), 1000).hot).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module `./islandModel` not found / functions undefined.

- [ ] **Step 3: Write the implementation**

```ts
// src/island/islandModel.ts
export type ActivityKind =
  | "focus-timer"
  | "clip-landed"
  | "recording"
  | "secret-blocked"
  | "agent-alert";

export interface IslandActivity {
  id: string;
  kind: ActivityKind;
  priority: number;
  persistent: boolean;
  label: string;
  detail?: string;
  accent?: string;
  expiresAt?: number;
}

export interface IslandView {
  persistent: IslandActivity | null;
  transient: IslandActivity | null;
  hot: boolean;
}

export interface IslandInputs {
  focus: { running: boolean; mode: "pomodoro" | "deep" | "watch"; remainingMs: number; taskTitle: string | null };
  recording: { active: boolean; elapsedMs: number; partial: string };
  latestClip: { id: string; kind: string; preview: string; createdAt: number; accent?: string } | null;
  lastBlockedAt: number | null;
  agentAlert: { id: string; label: string; percent: number } | null;
}

export const PRIORITY: Record<ActivityKind, number> = {
  "secret-blocked": 50,
  recording: 40,
  "focus-timer": 30,
  "agent-alert": 20,
  "clip-landed": 10,
};

const CLIP_TTL = 2500;
const SECRET_TTL = 4000;
const AGENT_TTL = 6000;

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export function buildActivities(input: IslandInputs, now: number): IslandActivity[] {
  const acts: IslandActivity[] = [];

  if (input.recording.active) {
    acts.push({
      id: "recording",
      kind: "recording",
      priority: PRIORITY.recording,
      persistent: true,
      label: fmt(input.recording.elapsedMs),
      detail: input.recording.partial || "Listening",
    });
  }

  if (input.focus.running) {
    acts.push({
      id: "focus-timer",
      kind: "focus-timer",
      priority: PRIORITY["focus-timer"],
      persistent: true,
      label: fmt(input.focus.remainingMs),
      detail: input.focus.taskTitle ?? "Focus",
    });
  }

  if (input.lastBlockedAt !== null) {
    acts.push({
      id: "secret-blocked",
      kind: "secret-blocked",
      priority: PRIORITY["secret-blocked"],
      persistent: false,
      label: "held",
      detail: "Secret not saved",
      expiresAt: input.lastBlockedAt + SECRET_TTL,
    });
  }

  if (input.agentAlert) {
    acts.push({
      id: `agent-${input.agentAlert.id}`,
      kind: "agent-alert",
      priority: PRIORITY["agent-alert"],
      persistent: false,
      label: `${Math.round(input.agentAlert.percent)}%`,
      detail: input.agentAlert.label,
      expiresAt: now + AGENT_TTL,
    });
  }

  if (input.latestClip) {
    acts.push({
      id: `clip-${input.latestClip.id}`,
      kind: "clip-landed",
      priority: PRIORITY["clip-landed"],
      persistent: false,
      label: input.latestClip.kind,
      detail: input.latestClip.preview,
      accent: input.latestClip.accent,
      expiresAt: input.latestClip.createdAt + CLIP_TTL,
    });
  }

  return acts;
}

export function selectIsland(activities: IslandActivity[], now: number): IslandView {
  const live = activities.filter((a) => a.expiresAt === undefined || a.expiresAt > now);
  const byPriority = (a: IslandActivity, b: IslandActivity) => b.priority - a.priority;
  const persistent = live.filter((a) => a.persistent).sort(byPriority)[0] ?? null;
  const transient = live.filter((a) => !a.persistent).sort(byPriority)[0] ?? null;
  return { persistent, transient, hot: Boolean(persistent || transient) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/island/islandModel.ts src/island/islandModel.test.ts
git commit -m "feat(island): pure activity-queue model with tests"
```

---

### Task 3: useIsland hook

**Files:**
- Create: `src/island/useIsland.ts`

**Interfaces:**
- Consumes: `useStore()` from `../store`; `buildActivities`, `selectIsland`, `IslandView` from `./islandModel`.
- Produces: `function useIsland(args: { now: number; recording: boolean; elapsedMs: number; partial: string; agentAlert?: {id: string; label: string; percent: number} | null }): IslandView`

- [ ] **Step 1: Write the hook**

```ts
// src/island/useIsland.ts
import { useStore } from "../store";
import { buildActivities, selectIsland, type IslandView } from "./islandModel";

export function useIsland(args: {
  now: number;
  recording: boolean;
  elapsedMs: number;
  partial: string;
  agentAlert?: { id: string; label: string; percent: number } | null;
}): IslandView {
  const { state } = useStore();
  const latest = state.clips[0] ?? null;
  const focusTask = state.tasks.find((t) => t.id === state.focus.taskId)?.title ?? null;

  const activities = buildActivities(
    {
      focus: {
        running: state.focus.running,
        mode: state.focus.mode,
        remainingMs: state.focus.remainingMs,
        taskTitle: focusTask,
      },
      recording: { active: args.recording, elapsedMs: args.elapsedMs, partial: args.partial },
      latestClip: latest
        ? {
            id: latest.id,
            kind: latest.kind,
            preview: latest.preview,
            createdAt: latest.createdAt,
            accent: latest.kind === "color" ? latest.content : undefined,
          }
        : null,
      lastBlockedAt: state.lastBlockedAt,
      agentAlert: args.agentAlert ?? null,
    },
    args.now,
  );

  return selectIsland(activities, args.now);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: no errors from `useIsland.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/island/useIsland.ts
git commit -m "feat(island): useIsland hook adapting store state"
```

---

### Task 4: IslandPill component

**Files:**
- Create: `src/island/IslandPill.tsx`
- Modify: `src/styles.css` (append `.island-pill*` rules)

**Interfaces:**
- Consumes: `IslandActivity` from `./islandModel`; `motion` from `framer-motion`.
- Produces: `function IslandPill({ activity, reduced }: { activity: IslandActivity; reduced: boolean }): JSX.Element`

- [ ] **Step 1: Write the component**

```tsx
// src/island/IslandPill.tsx
import { motion } from "framer-motion";
import type { IslandActivity } from "./islandModel";

export function IslandPill({ activity, reduced }: { activity: IslandActivity; reduced: boolean }) {
  const spring = reduced
    ? { duration: 0.12 }
    : { type: "spring" as const, stiffness: 420, damping: 32 };
  return (
    <motion.span
      layout
      className={`island-pill kind-${activity.kind}`}
      initial={{ opacity: 0, scale: 0.8, y: reduced ? 0 : -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: reduced ? 0 : -4 }}
      transition={spring}
      title={activity.detail ?? activity.label}
    >
      {activity.accent ? (
        <i className="island-swatch" style={{ background: activity.accent }} aria-hidden="true" />
      ) : null}
      <b className="island-pill-label">{activity.label}</b>
      {activity.detail ? <span className="island-pill-detail">{activity.detail}</span> : null}
    </motion.span>
  );
}
```

- [ ] **Step 2: Append styles**

Append to `src/styles.css`:

```css
.island-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--paper, #f3e2c8);
  background: rgba(255, 255, 255, 0.06);
  max-width: 200px;
  overflow: hidden;
  white-space: nowrap;
}
.island-pill-label { font-variant-numeric: tabular-nums; }
.island-pill-detail { opacity: 0.7; text-overflow: ellipsis; overflow: hidden; }
.island-swatch { width: 10px; height: 10px; border-radius: 3px; flex: none; }
.island-pill.kind-secret-blocked { color: #ffd9d9; background: rgba(255, 80, 80, 0.14); }
.island-pill.kind-recording { color: #ffe0b0; }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/island/IslandPill.tsx src/styles.css
git commit -m "feat(island): IslandPill component + styles"
```

---

### Task 5: Wire Framer Motion into the shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/NotchDock.tsx`

**Interfaces:**
- Consumes: `useIsland` (Task 3), `IslandPill` (Task 4), `AnimatePresence`, `motion`, `useReducedMotion` from `framer-motion`.
- Produces: `NotchDock` accepts a new prop `view: IslandView` and renders `persistent` + `transient` pills; existing `live`/`task` props removed in favor of `view`.

- [ ] **Step 1: Update NotchDock to render pills + spring stage**

In `NotchDock.tsx`: import `motion, AnimatePresence, useReducedMotion` from `framer-motion`, `IslandPill` from `../island/IslandPill`, `IslandView` from `../island/islandModel`. Replace the `live`/`task` props with `view: IslandView`. Replace the `dock-timer` span (lines 56–60) with:

```tsx
<span className="dock-pills">
  <AnimatePresence mode="popLayout">
    {view.persistent ? <IslandPill key={view.persistent.id} activity={view.persistent} reduced={!!reduced} /> : null}
    {view.transient ? <IslandPill key={view.transient.id} activity={view.transient} reduced={!!reduced} /> : null}
  </AnimatePresence>
</span>
```

Add `const reduced = useReducedMotion();` at the top of the component. Wrap the returned outer `<div className="dock ...">` as `<motion.div layout transition={reduced ? { duration: 0.12 } : { type: "spring", stiffness: 380, damping: 30 }} ...>` (keep all existing className/data-/handlers).

- [ ] **Step 2: Update App.tsx to compute and pass the view**

In `App.tsx`: import `useIsland` from `./island/useIsland`. Replace the `islandLabel` useMemo (lines 313–335) with:

```tsx
const view = useIsland({
  now,
  recording: recorder.recording,
  elapsedMs: recorder.elapsedMs,
  partial: recorder.partial,
});
```

Update the `<NotchDock ...>` call: remove `live={islandLabel.live}` and `task={islandLabel.task}`, add `view={view}`. For the web `island` button, replace `islandLabel.hot` with `view.hot`, and replace the two `islandLabel.live`/`islandLabel.task` spans with:

```tsx
{view.persistent ? <span className="live">{view.persistent.label}</span> : view.transient ? <span className="live">{view.transient.label}</span> : null}
{view.persistent?.detail ? <span className="live-task">{view.persistent.detail}</span> : view.transient?.detail ? <span className="live-task">{view.transient.detail}</span> : null}
```

- [ ] **Step 3: Add dock-pills style**

Append to `src/styles.css`:

```css
.dock-pills { display: inline-flex; align-items: center; gap: 6px; }
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc -b --noEmit && npm run build`
Expected: no type errors; Vite build succeeds. (Fix any leftover reference to `islandLabel` or the old `live`/`task` props.)

- [ ] **Step 5: Run unit tests**

Run: `npm test`
Expected: PASS (model tests still green).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/NotchDock.tsx src/styles.css
git commit -m "feat(island): spring-animated shell + live-activity pills"
```

---

### Task 6: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the web dev build**

Run: `npm run dev`, open http://localhost:5173

- [ ] **Step 2: Verify behaviors**

- Copy a desk sticker → a transient "clip-landed" pill appears and fades ~2.5s later.
- Copy the "Looks like a key" sticker → a red "held" secret pill appears (top priority) and clears ~4s.
- Start a Focus session → a persistent countdown pill stays; copy something → both a persistent (focus) and transient (clip) pill show together.
- Press ⌥L (or mic) to record → a persistent recording pill outranks focus.
- Hover the island → peek/expand still animates; ⌥N toggles; Esc closes.
- Toggle OS "Reduce Motion" → transitions become short fades, no springs.

- [ ] **Step 3: Confirm no regressions**

⌘K search focus, ⌘⌃1–0 paste, layout flip, and close/quit still work.

- [ ] **Step 4: Final commit (if any tweaks)**

```bash
git add -A && git commit -m "chore(island): phase 1 verification tweaks"
```

---

## Self-Review

- **Spec coverage (§5):** state machine idle/peek/expanded — peek/expand already exist in App; springs added in Task 5. Live activities (focus-timer, clip-landed, recording, secret-blocked, agent-alert) — all in `buildActivities` (Task 2). Priority + one-persistent/one-transient + expiry — `selectIsland` (Task 2). `agent-alert` wiring from real polling is stubbed as an optional `agentAlert` arg (defaults null) and fully realized in Phase 5; noted, not a gap for Phase 1. Files match §5.3. Reduced-motion covered (Tasks 4–5).
- **Placeholder scan:** none — all steps contain real code.
- **Type consistency:** `IslandView`/`IslandActivity`/`IslandInputs` names identical across Tasks 2–5; `view` prop replaces `live`/`task` consistently in both NotchDock (Task 5.1) and App (Task 5.2).
- **Note:** `types.ts` re-export (listed in File Structure) is optional convenience — consumers import from `./island/islandModel` directly, so no task depends on it; skip unless desired.
