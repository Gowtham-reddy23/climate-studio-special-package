import { describe, expect, it } from "vitest";
import { seed } from "./seed";
import { reduce } from "./store";
import type { AppState } from "./types";

function fresh(): AppState {
  return {
    ...seed,
    tasks: [],
    notes: [],
    events: [
      { id: "e1", title: "Design critique", start: "14:30", end: "15:00", calendar: "Work" },
    ],
    focus: { ...seed.focus, running: false, remainingMs: 25 * 60 * 1000, durationMs: 25 * 60 * 1000, taskId: null, startedAt: null },
    water: { ...seed.water, count: 0, day: new Date().toISOString().slice(0, 10), lastAt: null },
  };
}

describe("micro actions", () => {
  it("turns a task into a note that keeps the title", () => {
    const withTask = reduce(fresh(), { type: "add-task", title: "Ship the notch", when: "today" });
    const task = withTask.tasks[0];
    const next = reduce(withTask, { type: "add-note", title: task.title, kind: "write", body: task.title });
    expect(next.notes[0].title).toBe("Ship the notch");
    expect(next.notes[0].body).toBe("Ship the notch");
    expect(next.notes[0].kind).toBe("write");
  });

  it("reminds a task thirty minutes out and can clear it", () => {
    const start = reduce(fresh(), { type: "add-task", title: "Call", when: "later" });
    const id = start.tasks[0].id;
    const at = Date.now() + 30 * 60 * 1000;
    const reminded = reduce(start, { type: "set-task", id, remindAt: at, when: "today", snoozeUntil: null });
    expect(reminded.tasks[0].remindAt).toBe(at);
    expect(reminded.tasks[0].when).toBe("today");
    const cleared = reduce(reminded, { type: "set-task", id, remindAt: null });
    expect(cleared.tasks[0].remindAt).toBeNull();
  });

  it("starts focus on that task for its limit", () => {
    const start = reduce(fresh(), { type: "add-task", title: "Deep work", when: "today" });
    const id = start.tasks[0].id;
    const limited = reduce(start, { type: "set-task", id, limitMin: 40 });
    const running = reduce(limited, { type: "focus-start", mode: "pomodoro", taskId: id, durationMs: 40 * 60 * 1000 });
    expect(running.focus.running).toBe(true);
    expect(running.focus.taskId).toBe(id);
    expect(running.focus.remainingMs).toBe(40 * 60 * 1000);
    const paused = reduce(running, { type: "focus-pause" });
    expect(paused.focus.running).toBe(false);
    expect(paused.focus.remainingMs).toBe(40 * 60 * 1000);
  });

  it("sets 15, 25, and 40 minute presets without starting", () => {
    let state = fresh();
    for (const minutes of [15, 25, 40]) {
      state = reduce(state, { type: "focus-set", durationMs: minutes * 60 * 1000 });
      expect(state.focus.running).toBe(false);
      expect(state.focus.remainingMs).toBe(minutes * 60 * 1000);
    }
  });

  it("steps the clock by five minutes and will not drop under a minute while running", () => {
    const started = reduce(fresh(), { type: "focus-start", mode: "pomodoro", taskId: null, durationMs: 15 * 60 * 1000 });
    const plus = reduce(started, { type: "focus-add", minutes: 5 });
    expect(plus.focus.remainingMs).toBe(20 * 60 * 1000);
    const tiny = reduce({ ...plus, focus: { ...plus.focus, remainingMs: 60 * 1000 } }, { type: "focus-add", minutes: -5 });
    expect(tiny.focus.remainingMs).toBe(60 * 1000);
  });

  it("counts a focus session down and logs it when it ends", () => {
    const started = reduce(fresh(), { type: "focus-start", mode: "pomodoro", taskId: null, durationMs: 25 * 60 * 1000 });
    const ticked = reduce(started, { type: "focus-delta", ms: 30_000 });
    expect(ticked.focus.remainingMs).toBe(25 * 60 * 1000 - 30_000);
    const stopped = reduce(ticked, { type: "focus-stop" });
    expect(stopped.focus.running).toBe(false);
    expect(stopped.focusLog[0].durationMs).toBe(30_000);
  });

  it("checks a list line and files the line as a task title", () => {
    const noted = reduce(fresh(), { type: "add-note", title: "List", kind: "list", body: "- [ ] Buy paper" });
    const id = noted.notes[0].id;
    const checked = reduce(noted, { type: "toggle-note-line", id, index: 0 });
    expect(checked.notes[0].body.startsWith("- [x]")).toBe(true);
    const task = reduce(checked, { type: "add-task", title: "Buy paper", when: "today" });
    expect(task.tasks[0].title).toBe("Buy paper");
    expect(task.tasks[0].when).toBe("today");
  });

  it("keeps a voice note separate from a written page", () => {
    const page = reduce(fresh(), { type: "add-note", title: "Today", kind: "write", body: "A page" });
    const voice = reduce(page, {
      type: "add-note",
      title: "Bas ke suna",
      kind: "write",
      body: "Bas ke suna becomes an older song",
      via: "voice",
      audioId: "clip_1",
      durationMs: 6000,
    });
    expect(voice.notes[0].via).toBe("voice");
    expect(voice.notes[0].audioId).toBe("clip_1");
    expect(voice.notes[1].via).toBeUndefined();
  });

  it("drinks a glass and replaces sample events with the calendar", () => {
    const sipped = reduce(fresh(), { type: "water-drink" });
    expect(sipped.water.count).toBe(1);
    const cal = reduce(sipped, {
      type: "set-events",
      events: [{ id: "real", title: "Standup", start: "10:00", end: "10:15", calendar: "Work" }],
    });
    expect(cal.events.map((e) => e.id)).toEqual(["real"]);
  });

  it("marks a task done and clears done tasks", () => {
    const start = reduce(fresh(), { type: "add-task", title: "One", when: "today" });
    const id = start.tasks[0].id;
    const done = reduce(start, { type: "toggle-task", id });
    expect(done.tasks[0].done).toBe(true);
    const cleared = reduce(done, { type: "clear-done" });
    expect(cleared.tasks).toHaveLength(0);
  });
});
