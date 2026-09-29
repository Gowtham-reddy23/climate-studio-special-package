import { InsightsCard } from "../components/InsightsCard";
import { Roux } from "../components/Pebble";
import { useScreenTime } from "../hooks/useScreenTime";
import { formatSpent, formatTime } from "../lib";
import { isNativeApp, openPrivacy } from "../native";
import { FOCUS_COPY } from "../seed";
import { useStore } from "../store";
import type { FocusLog, FocusState } from "../types";

const MODES: { id: FocusState["mode"]; label: string }[] = [
  { id: "pomodoro", label: "25 min" },
  { id: "deep", label: "50 min" },
  { id: "watch", label: "Stopwatch" },
];

export function FocusView() {
  const { state, dispatch } = useStore();
  const display = state.focus.remainingMs;
  const systemTime = useScreenTime();
  const onScreen = isNativeApp() ? (systemTime.allowed ? systemTime.ms ?? 0 : null) : screenToday(state.focusLog, state.focus);

  return (
    <div className="focus-split">
      <div className="focus-face">
        <Roux mood={state.focus.running ? "focus" : "idle"} size={88} />
        <time>{formatTime(display)}</time>
        <p>{FOCUS_COPY}</p>
        <div className="modes">
          {MODES.map((m) => (
            <button
              key={m.id}
              className="chip"
              aria-pressed={state.focus.mode === m.id}
              onClick={() => dispatch({ type: "focus-start", mode: m.id, taskId: null })}
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
                  : dispatch({ type: "focus-start", mode: state.focus.mode, taskId: null })
              }
            >
              Start
            </button>
          )}
          <button className="btn ghost" onClick={() => dispatch({ type: "focus-add", minutes: 5 })}>
            +5 min
          </button>
          <button className="btn ghost" onClick={() => dispatch({ type: "focus-stop" })}>
            Stop
          </button>
        </div>
      </div>
      <aside className="focus-spent">
        <span>Time spent</span>
        <strong>{onScreen == null ? "—" : formatSpent(onScreen)}</strong>
        <em>{onScreen == null ? "Full Disk Access is off" : "Screen Time"}</em>
        {onScreen == null ? (
          <button type="button" className="btn primary" onClick={() => void openPrivacy("fulldisk")}>
            Allow access
          </button>
        ) : null}
        <InsightsCard />
      </aside>
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

