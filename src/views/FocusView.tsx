import { InsightsCard } from "../components/InsightsCard";
import { Roux } from "../components/Pebble";
import { formatTime } from "../lib";
import { useStore } from "../store";
import type { FocusState } from "../types";

const MODES: { id: FocusState["mode"]; label: string }[] = [
  { id: "pomodoro", label: "25 min" },
  { id: "deep", label: "50 min" },
  { id: "watch", label: "Stopwatch" },
];

export function FocusView() {
  const { state, dispatch } = useStore();
  const task = state.tasks.find((t) => t.id === state.focus.taskId);
  const display = state.focus.remainingMs;

  return (
    <div className="focus-face">
      <Roux mood={state.focus.running ? "focus" : "idle"} size={120} />
      <time>{formatTime(display)}</time>
      <p>{task ? task.title : "Roux is ready when you are"}</p>
      <div className="modes">
        {MODES.map((m) => (
          <button
            key={m.id}
            className="chip"
            aria-pressed={state.focus.mode === m.id}
            onClick={() => dispatch({ type: "focus-start", mode: m.id, taskId: state.focus.taskId })}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="row" style={{ justifyContent: "center" }}>
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
                : dispatch({ type: "focus-start", mode: state.focus.mode, taskId: state.focus.taskId })
            }
          >
            Start
          </button>
        )}
        <button className="btn ghost" onClick={() => dispatch({ type: "focus-add", minutes: 5 })}>
          +5 min
        </button>
        <button className="btn ghost" onClick={() => dispatch({ type: "focus-stop" })}>
          Reset
        </button>
      </div>
      <p className="kbd-row" style={{ justifyContent: "center" }}>
        Close the panel. The timer stays in the notch.
      </p>
      <InsightsCard />
    </div>
  );
}
