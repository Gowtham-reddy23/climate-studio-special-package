import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../store";
import type { Task, TaskWhen } from "../types";

const WHENS: { id: TaskWhen; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "next", label: "Next" },
  { id: "later", label: "Later" },
];

const LIMITS = [15, 25, 50];

export function TasksView({ query }: { query: string }) {
  const { state, dispatch } = useStore();
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState<TaskWhen>("today");
  const q = query.trim().toLowerCase();
  const tasks = state.tasks.filter((t) => `${t.title} ${t.detail ?? ""}`.toLowerCase().includes(q));
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const now = Date.now();
  const later = open.filter((t) => (t.snoozeUntil ?? 0) > now);
  const active = open.filter((t) => (t.snoozeUntil ?? 0) <= now);

  const add = (e: FormEvent) => {
    e.preventDefault();
    dispatch({ type: "add-task", title, when });
    setTitle("");
  };

  const columns: { id: string; label: string; tone: string; items: Task[]; empty: string }[] = [
    { id: "today", label: "Today", tone: "is-today", items: active.filter((t) => (t.when ?? "today") === "today"), empty: "Nothing left for today." },
    { id: "next", label: "Next", tone: "is-next", items: active.filter((t) => t.when === "next"), empty: "Nothing queued next." },
    { id: "later", label: "Later", tone: "is-later", items: [...active.filter((t) => t.when === "later"), ...later], empty: "Nothing waiting." },
    { id: "done", label: "Done", tone: "is-done", items: done, empty: "Nothing finished yet." },
  ];

  return (
    <div className="workspace task-board">
      {columns.map((col) => (
        <section key={col.id} className={`ws-card ${col.tone}`}>
          <header>
            <strong>{col.label}</strong>
            <span>{col.items.length}</span>
          </header>
          {col.items.length === 0 ? <p className="ws-empty">{col.empty}</p> : null}
          <div className="task-list">
            {col.items.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
          {col.id === "today" ? (
            <form onSubmit={add}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" />
              <div className="when-picks">
                {WHENS.map((w) => (
                  <button key={w.id} type="button" className="chip" aria-pressed={when === w.id} onClick={() => setWhen(w.id)}>
                    {w.label}
                  </button>
                ))}
              </div>
            </form>
          ) : null}
          {col.id === "done" && done.length > 0 ? (
            <button className="ws-more" type="button" onClick={() => dispatch({ type: "clear-done" })}>
              Clear done
            </button>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const { dispatch } = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const save = () => {
    dispatch({ type: "set-task", id: task.id, title: draft });
    setEditing(false);
  };

  const hint = [
    task.limitMin ? `${task.limitMin}m` : "",
    task.remindAt ? `Remind ${clock(task.remindAt)}` : "",
    task.when && task.when !== "today" ? task.when : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`task ${task.done ? "done" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div className="task-main">
      <button
        className="check"
        aria-checked={task.done}
        onClick={() => dispatch({ type: "toggle-task", id: task.id })}
      />
      <div className="ttl">
        {editing ? (
          <input
            className="task-edit"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
        ) : (
          <button className="task-title" onClick={() => setEditing(true)}>
            {task.title}
          </button>
        )}
        {hint ? <em className="task-hint">{hint}</em> : null}
        {task.detail ? <em className="task-hint">{task.detail}</em> : null}
      </div>
      <button
        className="icon-btn"
        title="Task menu"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left, y: r.bottom + 4 });
        }}
      >
        •••
      </button>
      </div>
      {task.done ? null : (
        <span className="ws-micro">
          <button
            type="button"
            title="Start a focus on this task"
            onClick={() =>
              dispatch({
                type: "focus-start",
                mode: "pomodoro",
                taskId: null,
                durationMs: (task.limitMin ?? 25) * 60 * 1000,
              })
            }
          >
            Focus
          </button>
          <button
            type="button"
            title="Remind in 30 minutes"
            onClick={() => dispatch({ type: "set-task", id: task.id, remindAt: Date.now() + 30 * 60 * 1000, when: "today" })}
          >
            Remind
          </button>
          <button
            type="button"
            title="Save this task as a note"
            onClick={() => dispatch({ type: "add-note", title: task.title, kind: "write", body: task.detail?.trim() || task.title })}
          >
            Note
          </button>
        </span>
      )}
      {menu ? (
        <TaskMenu
          task={task}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onRename={() => {
            setDraft(task.title);
            setEditing(true);
          }}
        />
      ) : null}
    </div>
  );
}

function TaskMenu({
  task,
  x,
  y,
  onClose,
  onRename,
}: {
  task: Task;
  x: number;
  y: number;
  onClose: () => void;
  onRename: () => void;
}) {
  const { dispatch } = useStore();
  const [sub, setSub] = useState<"remind" | "limit" | null>(null);
  const [customMin, setCustomMin] = useState("20");
  const [customTime, setCustomTime] = useState("18:00");

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [onClose]);

  const focus = () => {
    const durationMs = task.limitMin ? task.limitMin * 60 * 1000 : undefined;
    dispatch({ type: "focus-start", mode: "pomodoro", taskId: task.id, durationMs });
    onClose();
  };

  const remind = (at: number) => {
    dispatch({ type: "set-task", id: task.id, remindAt: at, when: "today", snoozeUntil: null });
    onClose();
  };

  const left = Math.max(8, Math.min(x, window.innerWidth - 228));
  const top = Math.max(8, Math.min(y, window.innerHeight - 320));

  return createPortal(
    <>
      <button className="task-menu-shade" aria-label="Close menu" onClick={onClose} />
      <div className="task-menu" style={{ left, top }} role="menu">
        <button type="button" onClick={focus}>
          Focus
        </button>
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "toggle-task", id: task.id });
            onClose();
          }}
        >
          {task.done ? "Mark as open" : "Mark as done"}
        </button>
        <button
          type="button"
          onClick={() => {
            onRename();
            onClose();
          }}
        >
          Rename…
        </button>
        <button type="button" className={sub === "limit" ? "is-on" : ""} onClick={() => setSub(sub === "limit" ? null : "limit")}>
          Set time limit…
        </button>
        {sub === "limit" ? (
          <div className="task-sub">
            {LIMITS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  dispatch({ type: "set-task", id: task.id, limitMin: m });
                  onClose();
                }}
              >
                {m} minutes
              </button>
            ))}
            <label>
              <input value={customMin} onChange={(e) => setCustomMin(e.target.value)} inputMode="numeric" />
              <button
                type="button"
                onClick={() => {
                  const n = Number(customMin);
                  if (n > 0) dispatch({ type: "set-task", id: task.id, limitMin: Math.round(n) });
                  onClose();
                }}
              >
                Custom
              </button>
            </label>
          </div>
        ) : null}
        <button type="button" className={sub === "remind" ? "is-on" : ""} onClick={() => setSub(sub === "remind" ? null : "remind")}>
          Remind me
        </button>
        {sub === "remind" ? (
          <div className="task-sub">
            <button type="button" onClick={() => remind(Date.now() + 30 * 60 * 1000)}>
              In 30 minutes
            </button>
            <button type="button" onClick={() => remind(Date.now() + 60 * 60 * 1000)}>
              In 1 hour
            </button>
            <button type="button" onClick={() => remind(thisEvening())}>
              This evening
            </button>
            <button type="button" onClick={() => remind(tomorrowMorning())}>
              Tomorrow morning
            </button>
            <label>
              <input type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} />
              <button type="button" onClick={() => remind(atTime(customTime))}>
                Custom
              </button>
            </label>
            {task.remindAt ? (
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: "set-task", id: task.id, remindAt: null });
                  onClose();
                }}
              >
                Clear reminder
              </button>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "set-task", id: task.id, when: "next", snoozeUntil: startOfTomorrow() });
            onClose();
          }}
        >
          Move to tomorrow
        </button>
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "duplicate-task", id: task.id });
            onClose();
          }}
        >
          Duplicate
        </button>
        <button
          type="button"
          className="is-danger"
          onClick={() => {
            dispatch({ type: "remove-task", id: task.id });
            onClose();
          }}
        >
          Delete
        </button>
      </div>
    </>,
    document.body,
  );
}

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function startOfTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function thisEvening() {
  const d = new Date();
  d.setHours(18, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function tomorrowMorning() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

function atTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}
