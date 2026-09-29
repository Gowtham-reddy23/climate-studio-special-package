import { useEffect, useRef, useState, type FormEvent } from "react";
import { NoteToolbar } from "../components/NoteToolbar";
import { useScreenTime } from "../hooks/useScreenTime";
import { eventMinutesFromNow, formatSpent, formatTime, todayKey, waterIsDue } from "../lib";
import { isNativeApp } from "../native";
import { applyNoteMark, type NoteMark } from "../noteMarks";
import { FOCUS_COPY } from "../seed";
import { useStore } from "../store";
import type { FocusLog, FocusState, Tab, WaterState } from "../types";

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
  const padRef = useRef<HTMLTextAreaElement>(null);
  const systemTime = useScreenTime();
  const dateLabel = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const water = state.water ?? { goal: 8, count: 0, day: day, intervalMin: 60, lastAt: null };
  const glasses = water.day === day ? water.count : 0;
  const due = waterIsDue(water);
  const screenMs = systemTime ?? (isNativeApp() ? null : screenToday(state.focusLog, state.focus));

  const add = (e: FormEvent) => {
    e.preventDefault();
    dispatch({ type: "add-task", title, when: "today" });
    setTitle("");
  };

  const markNote = (mark: NoteMark) => {
    const el = padRef.current;
    if (!el) return;
    const next = applyNoteMark(el.value, el.selectionStart, el.selectionEnd, mark);
    dispatch({ type: "set-note", day, text: next.text });
    const start = next.start;
    const end = next.end;
    requestAnimationFrame(() => {
      const node = padRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(start, end);
    });
  };

  const saveNote = () => {
    const text = note.trim();
    if (!text) return;
    dispatch({ type: "add-note", title: dateLabel, kind: "write", body: text });
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
        <time>{formatTime(state.focus.remainingMs)}</time>
        <p>{FOCUS_COPY}</p>
        <div className="ws-timer-presets">
          {[15, 25, 40].map((m) => (
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
          <button
            type="button"
            className="btn ghost"
            aria-label="Remove 5 minutes"
            onClick={() =>
              state.focus.running
                ? dispatch({ type: "focus-add", minutes: -5 })
                : dispatch({ type: "focus-set", durationMs: state.focus.remainingMs - 5 * 60 * 1000 })
            }
          >
            −
          </button>
          <button
            type="button"
            className="btn ghost"
            aria-label="Add 5 minutes"
            onClick={() =>
              state.focus.running
                ? dispatch({ type: "focus-add", minutes: 5 })
                : dispatch({ type: "focus-set", durationMs: state.focus.remainingMs + 5 * 60 * 1000 })
            }
          >
            +
          </button>
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
        <p>{screenMs == null ? "Needs Full Disk Access" : "Screen Time"}</p>
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
              {t.done ? null : (
                <span className="ws-micro">
                  <button
                    type="button"
                    title="Start a 25 minute focus"
                    onClick={() =>
                      dispatch({
                        type: "focus-start",
                        mode: "pomodoro",
                        taskId: null,
                        durationMs: (t.limitMin ?? 25) * 60 * 1000,
                      })
                    }
                  >
                    Focus
                  </button>
                  <button
                    type="button"
                    title="Remind in 30 minutes"
                    onClick={() => dispatch({ type: "set-task", id: t.id, remindAt: Date.now() + 30 * 60 * 1000 })}
                  >
                    Remind
                  </button>
                  <button
                    type="button"
                    title="Save this task as a note"
                    onClick={() => dispatch({ type: "add-note", title: t.title, kind: "write", body: t.detail?.trim() || t.title })}
                  >
                    Note
                  </button>
                </span>
              )}
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
        <NoteToolbar onMark={markNote} />
        <textarea
          ref={padRef}
          value={note}
          placeholder="Write the thought down. Use the list buttons for bullets, numbers, or checks."
          onChange={(e) => dispatch({ type: "set-note", day, text: e.target.value })}
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
          <span>{events.length ? "Today" : "Clear"}</span>
        </header>
        {events.length === 0 ? <p className="ws-empty">Nothing on Google Calendar.</p> : null}
        <ul className="ws-events">
          {events.slice(0, 4).map((e) => {
            const mins = eventMinutesFromNow(e.start);
            return (
              <li key={e.id}>
                <strong>{e.title}</strong>
                <em>
                  {e.start}–{e.end}
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
