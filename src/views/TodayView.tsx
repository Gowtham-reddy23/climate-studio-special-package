import { useEffect, useRef, useState, type FormEvent } from "react";
import { NoteEditor } from "../components/NoteEditor";
import { useScreenTime } from "../hooks/useScreenTime";
import { eventMinutesFromNow, formatSpent, formatTime, todayKey, waterIsDue } from "../lib";
import { isNativeApp, openPrivacy } from "../native";
import { splitNote } from "../noteFiles";
import { FOCUS_COPY } from "../seed";
import { useStore } from "../store";
import type { FocusLog, FocusState, Tab, Task, WaterState } from "../types";

export function TodayView({
  query,
  onOpen,
}: {
  query: string;
  onOpen: (tab: Tab) => void;
  onCopy: (content: string) => void;
}) {
  const { state, dispatch } = useStore();
  const q = query.trim().toLowerCase();
  const day = todayKey();
  const note = state.notesByDay[day] ?? "";
  const words = note.trim() ? note.trim().split(/\s+/).length : 0;
  const todayTasks = state.tasks.filter((t) => (t.when ?? "today") === "today" && (t.snoozeUntil ?? 0) <= Date.now());
  const visibleTasks = todayTasks.filter((t) => !q || t.title.toLowerCase().includes(q));
  const openTasks = visibleTasks.filter((t) => !t.done);
  const doneTasks = visibleTasks.filter((t) => t.done);
  const doneCount = todayTasks.filter((t) => t.done).length;
  const events = state.events.filter(
    (e) => !q || e.title.toLowerCase().includes(q) || e.calendar.toLowerCase().includes(q),
  );
  const [title, setTitle] = useState("");
  const [saved, setSaved] = useState(false);
  const systemTime = useScreenTime();
  const screenMs = isNativeApp() ? (systemTime.allowed ? systemTime.ms ?? 0 : null) : screenToday(state.focusLog, state.focus);
  const dateLabel = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const water = state.water ?? { goal: 8, count: 0, day: day, intervalMin: 60, lastAt: null };
  const glasses = water.day === day ? water.count : 0;
  const due = waterIsDue(water);

  const add = (e: FormEvent) => {
    e.preventDefault();
    dispatch({ type: "add-task", title, when: "today" });
    setTitle("");
  };

  const saveNote = () => {
    const text = note.trim();
    if (!text) return;
    const prose = splitNote(text).prose.trim();
    dispatch({ type: "add-note", title: prose.split("\n").find(Boolean)?.slice(0, 64) || dateLabel, kind: "write", body: text });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  return (
    <div className="workspace">
      <div className="ws-stack">
      <section className="ws-card is-timer">
        <header>
          <strong>Focus</strong>
          <span>{state.focus.running ? "Running" : "Ready"}</span>
        </header>
        <div className="ws-timer-step">
          <button
            type="button"
            className="timer-diamond"
            aria-label="Remove 5 minutes"
            onClick={() =>
              state.focus.running
                ? dispatch({ type: "focus-add", minutes: -5 })
                : dispatch({ type: "focus-set", durationMs: state.focus.remainingMs - 5 * 60 * 1000 })
            }
          >
            <span>−</span>
          </button>
          <time>{formatTime(state.focus.remainingMs)}</time>
          <button
            type="button"
            className="timer-diamond"
            aria-label="Add 5 minutes"
            onClick={() =>
              state.focus.running
                ? dispatch({ type: "focus-add", minutes: 5 })
                : dispatch({ type: "focus-set", durationMs: state.focus.remainingMs + 5 * 60 * 1000 })
            }
          >
            <span>+</span>
          </button>
        </div>
        <p>{FOCUS_COPY}</p>
        <div className="ws-timer-presets">
          {[15, 25, 45].map((m) => (
            <button
              key={m}
              type="button"
              className="btn ghost"
              aria-pressed={Math.round(state.focus.remainingMs / 60000) === m}
              onClick={() => dispatch({ type: "focus-set", durationMs: m * 60 * 1000 })}
            >
              {m}m
            </button>
          ))}
        </div>
        <div className="ws-timer-start">
          {state.focus.running ? (
            <button className="btn" onClick={() => dispatch({ type: "focus-pause" })}>
              Pause
            </button>
          ) : (
            <button
              className="btn primary"
              onClick={() =>
                state.focus.startedAt
                  ? dispatch({ type: "focus-resume" })
                  : dispatch({
                      type: "focus-start",
                      mode: state.focus.mode === "watch" ? "pomodoro" : state.focus.mode,
                      taskId: null,
                      durationMs: state.focus.remainingMs,
                    })
              }
            >
              Start
            </button>
          )}
          <button className="btn ghost" type="button" onClick={() => dispatch({ type: "focus-stop" })}>
            Stop
          </button>
        </div>
      </section>
      <section className="ws-card is-spent">
        <header>
          <strong>Time spent</strong>
          <span>Today</span>
        </header>
        <time>{screenMs == null ? "—" : formatSpent(screenMs)}</time>
        <p>{screenMs == null ? "Full Disk Access is off" : "Screen Time"}</p>
        {screenMs == null ? (
          <button type="button" className="btn primary" onClick={() => void openPrivacy("fulldisk")}>
            Allow access
          </button>
        ) : null}
      </section>
      </div>

      <section className="ws-card is-tasks">
        <header>
          <strong>Today’s tasks</strong>
          <span>{dateLabel}</span>
        </header>
        <div className="ws-counts">
          <span>To do {openTasks.length}</span>
          <span>Completed {doneCount}</span>
        </div>
        <ul>
          {[...openTasks, ...doneTasks].slice(0, 6).map((t) => (
            <li key={t.id} className={t.done ? "is-done" : ""}>
              <div className="task-main">
                <button
                  className="check"
                  aria-checked={t.done}
                  aria-label={t.done ? "Mark not done" : "Mark done"}
                  onClick={() => dispatch({ type: "toggle-task", id: t.id })}
                />
                <span>
                  {t.title}
                  {t.remindAt && !t.done ? <em>Remind {clock(t.remindAt)}</em> : null}
                </span>
              </div>
              <TaskMore task={t} />
            </li>
          ))}
        </ul>
        {visibleTasks.length === 0 ? <p className="ws-empty">Nothing left for today.</p> : null}
        <form onSubmit={add}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" />
        </form>
        <button className="ws-more" onClick={() => onOpen("tasks")}>
          All tasks
        </button>
      </section>

      <section className="ws-card is-pad">
        <header>
          <strong>Notepad</strong>
          <span>{dateLabel}</span>
        </header>
        <NoteEditor
          value={note}
          placeholder="Write the thought down. Type / to format, or to add a link, image, or PDF."
          onChange={(text) => dispatch({ type: "set-note", day, text })}
        />
        <footer>
          <span>{words} {words === 1 ? "word" : "words"}</span>
          <span className="ws-pad-actions">
            <button type="button" className={`note-save ${saved ? "is-saved" : ""}`} onClick={saveNote} disabled={!note.trim()}>
              {saved ? "Saved" : "Save note"}
            </button>
            <button className="ws-more" onClick={() => onOpen("notes")}>
              Notes
            </button>
          </span>
        </footer>
      </section>

      <div className="ws-stack">
      <section className="ws-card is-events">
        <header>
          <strong>Events</strong>
          <span>Google</span>
        </header>
        {events.length === 0 ? (
          <p className="ws-empty">
            {state.google?.connected ? "Nothing on Google Calendar." : "Sign in with Google to show events."}
          </p>
        ) : null}
        {state.google?.connected || events.length > 0 ? null : (
          <button type="button" className="btn primary" onClick={() => window.dispatchEvent(new Event("cove-settings"))}>
            Sign in with Google
          </button>
        )}
        <ul className="ws-events">
          {events.slice(0, 4).map((e) => {
            const mins = eventMinutesFromNow(e.start);
            return (
              <li key={e.id}>
                <strong>{e.title}</strong>
                <em>
                  {e.end ? `${e.start}–${e.end}` : e.start}
                  {mins > 0 ? ` · in ${Math.round(mins)}m` : mins > -30 ? " · now" : ""}
                </em>
              </li>
            );
          })}
        </ul>
      </section>
      <section className={`ws-card is-water ${due ? "is-due" : ""}`}>
        <div className="water-row">
          <div className="water-glass" aria-hidden="true">
            <i className="water-fill" style={{ height: `${Math.round((glasses / water.goal) * 100)}%` }} />
            {due ? <i className="water-drop" /> : null}
            {due ? <i className="water-ripple" /> : null}
          </div>
          <div className="water-copy">
            <header>
              <strong>Water</strong>
              <span>{glasses}/{water.goal}</span>
            </header>
            <p>{sipLabel(water, day)}</p>
          </div>
        </div>
        <div className="water-glasses">
          {Array.from({ length: water.goal }, (_, i) => (
            <button
              key={i}
              type="button"
              className={i < glasses ? "is-full" : ""}
              aria-label={`${i + 1} of ${water.goal}`}
              onClick={() => dispatch({ type: "water-set", count: i + 1 === glasses ? i : i + 1 })}
            />
          ))}
        </div>
        <button className="btn primary" type="button" onClick={() => dispatch({ type: "water-drink" })}>
          Drink
        </button>
      </section>
      </div>
    </div>
  );
}

function TaskMore({ task }: { task: Task }) {
  const { dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <span className="task-more" ref={root}>
      <button type="button" className="task-more-btn" aria-label="More" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        •••
      </button>
      {open ? (
        <div className="task-more-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              run(() =>
                dispatch({
                  type: "focus-start",
                  mode: "pomodoro",
                  taskId: null,
                  durationMs: (task.limitMin ?? 25) * 60 * 1000,
                }),
              )
            }
          >
            Focus
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => run(() => dispatch({ type: "set-task", id: task.id, remindAt: Date.now() + 30 * 60 * 1000 }))}
          >
            Remind
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              run(() => dispatch({ type: "add-note", title: task.title, kind: "write", body: task.detail?.trim() || task.title }))
            }
          >
            Note
          </button>
        </div>
      ) : null}
    </span>
  );
}

function screenToday(logs: FocusLog[], focus: FocusState) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const logged = logs.filter((l) => l.startedAt >= start.getTime()).reduce((sum, l) => sum + l.durationMs, 0);
  if (!focus.startedAt) return logged;
  const live = focus.mode === "watch" ? focus.remainingMs : Math.max(0, focus.durationMs - focus.remainingMs);
  return logged + live;
}

function sipLabel(water: WaterState, day: string) {
  const count = water.day === day ? water.count : 0;
  if (count >= water.goal) return "Goal reached";
  if (!water.lastAt || water.day !== day) return "First glass of the day";
  const left = water.lastAt + water.intervalMin * 60_000 - Date.now();
  if (left <= 0) return "Time for a glass";
  const mins = Math.ceil(left / 60_000);
  return mins < 60 ? `Next in ${mins}m` : `Next in ${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
