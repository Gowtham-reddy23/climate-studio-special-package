import { formatTime } from "../lib";
import { Waveform } from "../components/Waveform";
import { todayKey } from "../lib";
import { useStore } from "../store";

export function NotesView({
  recording,
  partial,
  level,
  peaks,
  elapsedMs,
  error,
  speechAvailable,
  onListen,
  onCancel,
}: {
  recording: boolean;
  partial: string;
  level: number;
  peaks: number[];
  elapsedMs: number;
  error: string | null;
  speechAvailable: boolean;
  onListen: () => void;
  onCancel: () => void;
}) {
  const { state, dispatch } = useStore();
  const day = todayKey();
  const text = state.notesByDay[day] ?? "";

  return (
    <>
      <div className="section-title">
        <strong>Today’s notepad</strong>
        <button className={`btn ${recording ? "danger" : "primary"}`} onClick={onListen}>
          {recording ? "Save note" : "Voice note"}
        </button>
      </div>

      <div className={`listen-card ${recording ? "is-live" : ""}`}>
        {recording ? (
          <>
            <div className="listen-meta">
              <span className="listen-dot" />
              <strong>{formatTime(elapsedMs)}</strong>
              <span>{speechAvailable ? "Transcribing live" : "Saving audio"}</span>
            </div>
            <Waveform peaks={peaks.length ? peaks : Array.from({ length: 24 }, () => 0.12)} live={level} />
            <p className="listen-text">{partial || "Speak — Roux is writing it down."}</p>
            <button className="btn ghost" onClick={onCancel}>
              Discard
            </button>
          </>
        ) : (
          <p>
            {speechAvailable
              ? "Hit Voice note. Roux records the audio and transcribes as you talk. Save drops it into Kept and this notepad."
              : "Live transcript needs Chrome or Edge. Audio still saves, and you can type the words after."}
          </p>
        )}
      </div>

      {error ? <div className="secret-banner">{error}</div> : null}

      <div className="note-wrap">
        <textarea
          value={text}
          placeholder="Catch the thought, or let Roux listen."
          onChange={(e) => dispatch({ type: "set-note", day, text: e.target.value })}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              const pos = e.currentTarget.selectionStart;
              const line = text.slice(0, pos).split("\n").pop() ?? "";
              dispatch({ type: "add-task", title: line });
            }
          }}
        />
      </div>
    </>
  );
}
