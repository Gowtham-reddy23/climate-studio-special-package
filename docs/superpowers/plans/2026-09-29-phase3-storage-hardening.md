# Phase 3 — Storage Hardening Implementation Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox steps.

**Goal:** Make Cove's persistence robust: survive localStorage quota limits without data loss, stop leaking orphaned IndexedDB blobs, and add JSON export/import backup.

**Reframe:** The original spec §7 assumed blobs were base64 in localStorage. In reality `blobDb.ts` already stores full image/audio blobs in IndexedDB (only ~320px JPEG thumbnails live in localStorage). So this phase hardens what exists rather than migrating.

**Spec:** `docs/superpowers/specs/2026-09-29-cove-best-of-notch-design.md` (§7).

## Global Constraints
- macOS 14+; local-only; no new deps. Pure trim logic must be unit-testable (no DOM/`Date.now()` inside).

---

### Task 1: Quota-safe persistence (TDD)

**Files:** Create `src/storage.ts` + `src/storage.test.ts`; modify `src/store.tsx`.

**Interfaces:** `function trimForQuota(state: AppState): AppState` — drops the heaviest non-pinned clip content to shrink the payload, newest-first preserved, pinned always kept. `function persist(key: string, state: AppState): "ok" | "trimmed" | "failed"`.

- [ ] **Step 1: failing tests** (`src/storage.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { trimForQuota } from "./storage";
import { seed } from "./seed";
import type { AppState } from "./types";

function bigClip(id: string, pinned = false) {
  return { id, kind: "image" as const, content: "x".repeat(50_000), preview: "shot", createdAt: id.length, pinned, board: "Life", source: "s", meta: {} };
}

describe("trimForQuota", () => {
  it("clears heavy content from the oldest non-pinned clip first", () => {
    const state: AppState = { ...seed, clips: [bigClip("aaa"), bigClip("bb"), bigClip("c")] };
    const out = trimForQuota(state);
    // oldest (smallest createdAt = "c") loses its content
    const trimmed = out.clips.find((k) => k.id === "c");
    expect(trimmed!.content.length).toBeLessThan(50_000);
  });

  it("never trims a pinned clip", () => {
    const state: AppState = { ...seed, clips: [bigClip("c", true)] };
    const out = trimForQuota(state);
    expect(out.clips[0].content.length).toBe(50_000);
  });

  it("returns a new object, does not mutate input", () => {
    const state: AppState = { ...seed, clips: [bigClip("c")] };
    const before = state.clips[0].content;
    trimForQuota(state);
    expect(state.clips[0].content).toBe(before);
  });
});
```

- [ ] **Step 2: run — FAIL.** `npm test`

- [ ] **Step 3: implement `src/storage.ts`**

```ts
import type { AppState } from "./types";

const HEAVY = 2000; // chars — content larger than this is a trim candidate

/** Drop heavy content from the single oldest non-pinned clip. Pure. */
export function trimForQuota(state: AppState): AppState {
  const candidates = state.clips
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !c.pinned && c.content.length > HEAVY)
    .sort((a, b) => a.c.createdAt - b.c.createdAt);
  if (candidates.length === 0) return state;
  const victim = candidates[0].i;
  const clips = state.clips.map((c, i) =>
    i === victim ? { ...c, content: c.preview || "", meta: { ...c.meta, evicted: true } } : c,
  );
  return { ...state, clips };
}

export function persist(key: string, state: AppState): "ok" | "trimmed" | "failed" {
  try {
    localStorage.setItem(key, JSON.stringify(state));
    return "ok";
  } catch {
    let working = state;
    for (let n = 0; n < state.clips.length; n++) {
      working = trimForQuota(working);
      try {
        localStorage.setItem(key, JSON.stringify(working));
        return "trimmed";
      } catch {
        /* keep trimming */
      }
    }
    return "failed";
  }
}
```

Add `evicted?: boolean;` to `Clip["meta"]` in `types.ts`.

- [ ] **Step 4: run — PASS.** `npm test`

- [ ] **Step 5: wire into store.tsx.** Replace the persistence effect body:

```tsx
  useEffect(() => {
    persist(KEY, state);
  }, [state]);
```
and `import { persist } from "./storage";`.

- [ ] **Step 6: typecheck + commit.**

```bash
npx tsc -b --noEmit
git add src/storage.ts src/storage.test.ts src/store.tsx src/types.ts
git commit -m "feat(storage): quota-safe persistence with content eviction"
```

---

### Task 2: Blob GC (prune orphans on load)

**Files:** modify `src/blobDb.ts` (add `deleteBlob`, `pruneBlobs`); modify `src/store.tsx` (call prune after hydrate).

**Interfaces:** `deleteBlob(id: string): Promise<void>`; `pruneBlobs(validIds: string[]): Promise<number>` (returns count deleted).

- [ ] **Step 1: add to blobDb.ts**

```ts
export async function deleteBlob(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function pruneBlobs(validIds: string[]): Promise<number> {
  const keep = new Set(validIds);
  const db = await openDb();
  const keys: IDBValidKey[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const orphans = keys.filter((k) => typeof k === "string" && !keep.has(k)) as string[];
  await Promise.all(orphans.map((k) => deleteBlob(k)));
  return orphans.length;
}
```

- [ ] **Step 2: call prune once after hydrate in store.tsx** — inside the hydrate effect, after dispatch, add:

```tsx
      void import("./blobDb").then(({ pruneBlobs }) =>
        pruneBlobs([...(parsed.clips ?? [])].map((c) => c.id)),
      );
```

- [ ] **Step 3: typecheck + build + commit.**

```bash
npx tsc -b --noEmit && npm run build
git add src/blobDb.ts src/store.tsx
git commit -m "feat(storage): prune orphaned IndexedDB blobs on load"
```

---

### Task 3: Export / Import JSON backup

**Files:** create `src/components/BackupButtons.tsx`; modify `src/views/ClipboardView.tsx` (render near SkinPicker); modify `src/store.tsx` (already has hydrate).

**Interfaces:** `BackupButtons()` — Export downloads `cove-backup-<date>.json` (metadata state); Import reads a file and dispatches `hydrate`.

- [ ] **Step 1: BackupButtons.tsx**

```tsx
import { useRef } from "react";
import { useStore } from "../store";
import { seed } from "../seed";
import type { AppState } from "../types";

export function BackupButtons() {
  const { state, dispatch } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const onExport = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cove-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<AppState>;
      if (!parsed.clips || !parsed.tasks) return;
      dispatch({ type: "hydrate", state: { ...seed, ...parsed } as AppState });
    } catch {
      /* ignore bad file */
    }
  };

  return (
    <div className="backup">
      <button className="skin-chip" onClick={onExport}>Export</button>
      <button className="skin-chip" onClick={() => fileRef.current?.click()}>Import</button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
      />
    </div>
  );
}
```

- [ ] **Step 2: render in ClipboardView** — put `<BackupButtons />` right after `<SkinPicker />`; import it. Append CSS: `.backup { display: inline-flex; gap: 4px; margin: 0 0 8px 8px; }`

- [ ] **Step 3: typecheck + build + test + commit.**

```bash
npx tsc -b --noEmit && npm run build && npm test
git add src/components/BackupButtons.tsx src/views/ClipboardView.tsx src/styles.css
git commit -m "feat(storage): JSON export/import backup"
```

---

### Task 4: Browser verification
- [ ] Open Kept → click **Export** → a `cove-backup-*.json` downloads (permission-gated; confirm the download prompt).
- [ ] Confirm Export/Import buttons render next to the skin picker; no console errors.
- [ ] (trimForQuota + pruneBlobs covered by unit tests / load path.)

## Self-Review
- §7 quota safety → Task 1; blob lifecycle → Task 2; export/import → Task 3. ✓
- Pure `trimForQuota` unit-tested; no placeholders; `evicted` meta flag added to types.
- Note: Export triggers a file download (permission-gated action) — verify with the user's consent in the browser.
