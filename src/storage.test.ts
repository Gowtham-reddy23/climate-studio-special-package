import { describe, it, expect } from "vitest";
import { trimForQuota } from "./storage";
import { seed } from "./seed";
import type { AppState, Clip } from "./types";

function bigClip(id: string, pinned = false): Clip {
  return {
    id,
    kind: "image",
    content: "x".repeat(50_000),
    preview: "shot",
    createdAt: id.length,
    pinned,
    board: "Life",
    source: "s",
    meta: {},
  };
}

describe("trimForQuota", () => {
  it("clears heavy content from the oldest non-pinned clip first", () => {
    const state: AppState = { ...seed, clips: [bigClip("aaa"), bigClip("bb"), bigClip("c")] };
    const out = trimForQuota(state);
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
