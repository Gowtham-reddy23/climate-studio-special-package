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
    const acts = buildActivities(
      { ...base, focus: { running: true, mode: "pomodoro", remainingMs: 90_000, taskTitle: "Write" } },
      1000,
    );
    const t = acts.find((a) => a.kind === "focus-timer");
    expect(t).toBeTruthy();
    expect(t!.persistent).toBe(true);
    expect(t!.label).toBe("1:30");
  });

  it("emits a transient clip-landed that expires ~2.5s after copy", () => {
    const acts = buildActivities(
      { ...base, latestClip: { id: "c1", kind: "color", preview: "#fff", createdAt: 1000, accent: "#fff" } },
      1500,
    );
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
    const acts = buildActivities(
      { ...base, latestClip: { id: "c1", kind: "text", preview: "hi", createdAt: 0, accent: undefined } },
      5000,
    );
    const view = selectIsland(acts, 5000);
    expect(view.transient).toBeNull();
  });

  it("keeps a sip pill until the next glass is logged", () => {
    const acts = buildActivities({ ...base, water: { due: true, count: 2, goal: 8 } }, 1000);
    const sip = acts.find((a) => a.kind === "water-sip");
    expect(sip?.label).toBe("Sip");
    expect(sip?.detail).toBe("2/8");
    expect(selectIsland(acts, 1000).transient?.kind).toBe("water-sip");
  });

  it("is not hot when nothing is active", () => {
    expect(selectIsland(buildActivities(base, 1000), 1000).hot).toBe(false);
  });
});
