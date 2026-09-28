import { useState } from "react";
import { useStore } from "../store";

export function TasksView({ query }: { query: string }) {
  const { state, dispatch } = useStore();
  const [title, setTitle] = useState("");
  const q = query.trim().toLowerCase();
  const tasks = state.tasks.filter((t) => t.title.toLowerCase().includes(q));
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <>
      <form
        className="add"
        onSubmit={(e) => {
          e.preventDefault();
          dispatch({ type: "add-task", title });
          setTitle("");
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task"
        />
        <button className="btn primary" type="submit">
          Add
        </button>
      </form>

      {open.length === 0 && done.length === 0 ? (
        <div className="empty">No tasks yet. Capture one, or turn a clip into work.</div>
      ) : null}

      {open.map((t) => (
        <div key={t.id} className="task">
          <button
            className="check"
            aria-checked={false}
            onClick={() => dispatch({ type: "toggle-task", id: t.id })}
          />
          <span className="ttl">{t.title}</span>
          <button
            className="btn ghost"
            onClick={() => dispatch({ type: "focus-start", mode: "pomodoro", taskId: t.id })}
          >
            Focus
          </button>
        </div>
      ))}

      {done.length > 0 ? (
        <div className="section-title">
          <strong>Done</strong>
          <span>{done.length}</span>
        </div>
      ) : null}
      {done.map((t) => (
        <div key={t.id} className="task done">
          <button
            className="check"
            aria-checked="true"
            onClick={() => dispatch({ type: "toggle-task", id: t.id })}
          />
          <span className="ttl">{t.title}</span>
        </div>
      ))}
    </>
  );
}
