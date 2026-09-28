# Phase 2 — Skins + Color Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give Cove Tucket-style theming — four skins (Glass / Dark / Light / Mat) switchable + persisted — and broaden color auto-naming to cover `rgb()`/`hsl()` and a larger named palette.

**Architecture:** A `skin` value in the store drives a `data-skin` attribute on `<html>`; `styles.css` gets per-skin token overrides. Color naming moves to a `parseColorToRgb` helper (hex/rgb/hsl) feeding the existing nearest-RGB match against an expanded table.

**Tech Stack:** React 19, TS, Vitest, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-09-29-cove-best-of-notch-design.md` (§6.1, §6.2).

## Global Constraints

- macOS 14+; local-only; no new deps. Dark skin must remain pixel-identical to today's look (it is the current `:root`).
- Pure, testable color logic — no `Date.now()`/DOM in `lib.ts` color fns.

## Deferred to a later native/media batch (NOT this plan)
- **Remove background** (§6.3) — Apple Vision, native Rust; verify only via `npm run desktop`.
- **Moodboard** (§6.4) — canvas composite; needs real image clips to verify meaningfully.

---

### Task 1: Color naming — rgb()/hsl() + larger palette (TDD)

**Files:**
- Modify: `src/lib.ts` (COLOR_NAMES table, add `hslToRgb`, `parseColorToRgb`; `colorName` uses it)
- Test: `src/lib.color.test.ts`

**Interfaces:**
- Produces: `parseColorToRgb(value: string): [number, number, number] | null`; `colorName(value: string): string` (now handles hex/rgb/hsl).

- [ ] **Step 1: Write failing tests** (`src/lib.color.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { parseColorToRgb, colorName } from "./lib";

describe("parseColorToRgb", () => {
  it("parses hex", () => expect(parseColorToRgb("#6C6CF8")).toEqual([108, 108, 248]));
  it("parses short hex", () => expect(parseColorToRgb("#fff")).toEqual([255, 255, 255]));
  it("parses rgb()", () => expect(parseColorToRgb("rgb(108, 108, 248)")).toEqual([108, 108, 248]));
  it("parses rgba()", () => expect(parseColorToRgb("rgba(0,0,0,0.5)")).toEqual([0, 0, 0]));
  it("parses hsl() red", () => expect(parseColorToRgb("hsl(0, 100%, 50%)")).toEqual([255, 0, 0]));
  it("parses hsl() blue", () => expect(parseColorToRgb("hsl(240,100%,50%)")).toEqual([0, 0, 255]));
  it("returns null for junk", () => expect(parseColorToRgb("hello")).toBeNull());
});

describe("colorName", () => {
  it("names iris from hex", () => expect(colorName("#6C6CF8")).toBe("Iris"));
  it("names iris from rgb", () => expect(colorName("rgb(108,108,248)")).toBe("Iris"));
  it("names white", () => expect(colorName("#ffffff")).toBe("White"));
  it("names pure blue", () => expect(colorName("hsl(240,100%,50%)")).toBe("Blue"));
  it("falls back to Color on junk", () => expect(colorName("nope")).toBe("Color"));
});
```

- [ ] **Step 2: Run — expect FAIL** (`parseColorToRgb` not exported)

Run: `npm test`

- [ ] **Step 3: Implement.** In `src/lib.ts` replace the `COLOR_NAMES` array with the expanded table below, add `hslToRgb` + `parseColorToRgb`, and rewrite `colorName` to use `parseColorToRgb`. Keep `hexToRgb` (used elsewhere).

```ts
const COLOR_NAMES: [string, [number, number, number]][] = [
  ["Black", [0, 0, 0]], ["White", [255, 255, 255]], ["Ink", [20, 17, 26]],
  ["Night", [28, 32, 48]], ["Slate", [90, 98, 114]], ["Gray", [128, 128, 128]],
  ["Silver", [192, 192, 192]], ["Paper", [232, 220, 200]], ["Bone", [240, 234, 222]],
  ["Brass", [201, 168, 112]], ["Honey", [232, 176, 88]], ["Gold", [212, 175, 55]],
  ["Copper", [196, 107, 74]], ["Coral", [224, 112, 96]], ["Red", [229, 57, 53]],
  ["Crimson", [178, 34, 52]], ["Blush", [214, 154, 148]], ["Pink", [236, 128, 170]],
  ["Magenta", [214, 51, 132]], ["Violet", [124, 92, 168]], ["Purple", [128, 64, 176]],
  ["Iris", [108, 108, 248]], ["Indigo", [75, 61, 189]], ["Blue", [0, 0, 255]],
  ["Azure", [37, 99, 235]], ["Sky", [96, 165, 250]], ["Tide", [106, 138, 138]],
  ["Teal", [45, 156, 156]], ["Ocean", [64, 112, 152]], ["Sage", [152, 176, 148]],
  ["Moss", [90, 122, 96]], ["Green", [46, 160, 67]], ["Lime", [130, 200, 80]],
  ["Olive", [128, 128, 0]], ["Amber", [240, 180, 41]], ["Orange", [240, 138, 46]],
  ["Brown", [124, 82, 52]], ["Tan", [196, 164, 120]], ["Cream", [248, 240, 220]],
];

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function parseColorToRgb(value: string): [number, number, number] | null {
  const t = value.trim();
  if (t.startsWith("#")) return hexToRgb(t);
  const rgb = t.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const hsl = t.match(/^hsla?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)%[,\s]+(\d+(?:\.\d+)?)%/i);
  if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]), Number(hsl[3]));
  return null;
}

export function colorName(value: string) {
  const rgb = parseColorToRgb(value);
  if (!rgb) return "Color";
  let best = COLOR_NAMES[0][0];
  let dist = Infinity;
  for (const [name, c] of COLOR_NAMES) {
    const d = (rgb[0] - c[0]) ** 2 + (rgb[1] - c[1]) ** 2 + (rgb[2] - c[2]) ** 2;
    if (d < dist) { dist = d; best = name; }
  }
  return best;
}
```

- [ ] **Step 4: Run — expect PASS.** `npm test`
- [ ] **Step 5: Typecheck.** `npx tsc -b --noEmit`
- [ ] **Step 6: Commit.**

```bash
git add src/lib.ts src/lib.color.test.ts
git commit -m "feat(clipboard): color naming for rgb/hsl + larger palette"
```

---

### Task 2: Skin state in the store

**Files:**
- Modify: `src/types.ts` (add `Skin`, `skin` on `AppState`, `set-skin` action)
- Modify: `src/store.tsx` (reducer case, hydrate sanitize)
- Modify: `src/seed.ts` (default `skin: "dark"`)

**Interfaces:**
- Produces: `type Skin = "glass" | "dark" | "light" | "mat"`; action `{ type: "set-skin"; skin: Skin }`; `state.skin: Skin`.

- [ ] **Step 1: types.ts** — add after `DockLayout`:

```ts
export type Skin = "glass" | "dark" | "light" | "mat";
```
Add `skin: Skin;` to `interface AppState` (next to `layout`). Add to the `Action` union:
```ts
  | { type: "set-skin"; skin: Skin }
```

- [ ] **Step 2: store.tsx reducer** — add a case near `set-layout`:

```ts
    case "set-skin":
      return { ...state, skin: action.skin };
```
In the hydrate `dispatch`, add a sanitized skin next to `layout`:
```ts
            skin: (["glass", "dark", "light", "mat"] as const).includes(parsed.skin as never)
              ? (parsed.skin as AppState["skin"])
              : "dark",
```

- [ ] **Step 3: seed.ts** — add `skin: "dark",` to the seed `AppState` object (near `layout`).

- [ ] **Step 4: Typecheck.** `npx tsc -b --noEmit` — expect no errors.

- [ ] **Step 5: Commit.**

```bash
git add src/types.ts src/store.tsx src/seed.ts
git commit -m "feat(skins): skin state, action, seed default"
```

---

### Task 3: Skin CSS palettes

**Files:** Modify `src/styles.css` (append per-skin token blocks after `:root`).

- [ ] **Step 1:** Append these blocks immediately after the `:root { ... }` rule (dark = current defaults, so `[data-skin="dark"]` is a no-op alias; the others override tokens):

```css
/* ── Skins ─────────────────────────────────────────────── */
html[data-skin="light"] {
  --ink: #f4f0e8;
  --ink-2: #ffffff;
  --paper: #2a2620;
  --paper-dim: #5a5348;
  --glass: #ffffff;
  --glass-2: #f1ece2;
  --line: rgba(20, 17, 26, 0.12);
  --line-strong: rgba(20, 17, 26, 0.22);
  --text: #241f18;
  --muted: #6b6357;
}
html[data-skin="light"] body,
html[data-skin="light"] #root { background: #ece6da; }

html[data-skin="mat"] {
  --ink: #1a1a1d;
  --ink-2: #232327;
  --glass: #202024;
  --glass-2: #2a2a2f;
  --line: rgba(255, 255, 255, 0.08);
  --line-strong: rgba(255, 255, 255, 0.16);
  --text: #ecebe8;
  --muted: #9b9992;
}
html[data-skin="mat"] body,
html[data-skin="mat"] #root { background: #131315; }

html[data-skin="glass"] {
  --glass: rgba(30, 27, 40, 0.55);
  --glass-2: rgba(46, 42, 58, 0.55);
  --line: rgba(232, 220, 200, 0.18);
  --line-strong: rgba(232, 220, 200, 0.3);
}
html[data-skin="glass"] .panel,
html[data-skin="glass"] .dock,
html[data-skin="glass"] .island {
  backdrop-filter: blur(22px) saturate(1.3);
  -webkit-backdrop-filter: blur(22px) saturate(1.3);
}
```

- [ ] **Step 2: Build.** `npm run build` — expect success.
- [ ] **Step 3: Commit.**

```bash
git add src/styles.css
git commit -m "feat(skins): glass/light/mat palettes"
```

---

### Task 4: SkinPicker + apply data-skin

**Files:**
- Create: `src/components/SkinPicker.tsx`
- Modify: `src/App.tsx` (effect to set `document.documentElement.dataset.skin`)
- Modify: `src/views/ClipboardView.tsx` (render `<SkinPicker />` at top)
- Modify: `src/styles.css` (append `.skin-picker*` styles)

**Interfaces:**
- Consumes: `useStore`. Produces: `function SkinPicker(): JSX.Element`.

- [ ] **Step 1: SkinPicker.tsx**

```tsx
import { useStore } from "../store";
import type { Skin } from "../types";

const SKINS: { id: Skin; label: string }[] = [
  { id: "glass", label: "Glass" },
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "mat", label: "Mat" },
];

export function SkinPicker() {
  const { state, dispatch } = useStore();
  return (
    <div className="skin-picker" role="group" aria-label="Skin">
      {SKINS.map((s) => (
        <button
          key={s.id}
          className={`skin-chip ${state.skin === s.id ? "is-on" : ""}`}
          aria-pressed={state.skin === s.id}
          onClick={() => dispatch({ type: "set-skin", skin: s.id })}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: App.tsx** — add an effect (near the `native` class effect):

```tsx
  useEffect(() => {
    document.documentElement.dataset.skin = state.skin;
  }, [state.skin]);
```

- [ ] **Step 3: ClipboardView.tsx** — import and render the picker. Add `import { SkinPicker } from "../components/SkinPicker";` and place `<SkinPicker />` as the first child inside the returned `<>` (before the secret-banner block).

- [ ] **Step 4: styles.css** — append:

```css
.skin-picker { display: inline-flex; gap: 4px; margin: 0 0 8px; }
.skin-chip {
  padding: 3px 10px; border-radius: 999px; font-size: 11px;
  color: var(--muted); background: transparent;
  border: 1px solid var(--line);
}
.skin-chip.is-on { color: var(--text); background: var(--glass-2); border-color: var(--line-strong); }
```

- [ ] **Step 5: Typecheck + build.** `npx tsc -b --noEmit && npm run build` — expect success.
- [ ] **Step 6: Run tests.** `npm test` — expect PASS.
- [ ] **Step 7: Commit.**

```bash
git add src/components/SkinPicker.tsx src/App.tsx src/views/ClipboardView.tsx src/styles.css
git commit -m "feat(skins): skin picker + apply data-skin to root"
```

---

### Task 5: Browser verification

- [ ] **Step 1:** Open http://localhost:5173, open Cove → Kept tab.
- [ ] **Step 2:** Click each skin chip (Glass/Dark/Light/Mat) → confirm the panel/notch re-themes; Light inverts to a bright palette; Glass blurs; Dark matches the original.
- [ ] **Step 3:** Reload the page → confirm the last-selected skin persists (localStorage).
- [ ] **Step 4:** Copy a `rgb(...)` and an `hsl(...)` color sticker/value → confirm the clip shows a real color name (not "Color").
- [ ] **Step 5:** Confirm no console errors.

---

## Self-Review

- **Spec §6.1 skins:** Tasks 2–4 (state, palettes, picker, apply). ✓
- **Spec §6.2 color naming:** Task 1 (rgb/hsl + bigger table). ✓
- **§6.3 remove-bg / §6.4 moodboard:** explicitly deferred (native/media batch) — stated up front, not a silent cut.
- **§6.5 search:** already covers colorName/ocr/transcript in `ClipboardView` haystack — no work needed; noted.
- **Placeholder scan:** none.
- **Type consistency:** `Skin` union identical in types.ts, store sanitize, SkinPicker; `set-skin` action shape consistent.
- **Regression guard:** dark skin == current `:root`, so default look is unchanged.
