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
