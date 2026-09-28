import { eventMinutesFromNow, formatTime, todayKey } from "../lib";
import { useStore } from "../store";
import type { Tab } from "../types";
import { AgentsBento } from "../components/AgentsBento";
import { InsightsCard } from "../components/InsightsCard";

export function TodayView({
  query,
  onOpen,
  onCopy,
}: {
  query: string;
  onOpen: (tab: Tab) => void;
  onCopy: (content: string) => void;
}) {
  const { state, dispatch } = useStore();
  const q = query.trim().toLowerCase();
  const next = state.events
    .map((e) => ({ ...e, mins: eventMinutesFromNow(e.start) }))
    .filter((e) => e.mins > -15)
    .sort((a, b) => a.mins - b.mins)[0];
  const openTask = state.tasks.find((t) => !t.done);
  const note = (state.notesByDay[todayKey()] ?? "").split("\n").find(Boolean) ?? "";
  const clips = state.clips
    .filter((c) => {
      if (!q) return true;
      return `${c.preview} ${c.content} ${c.meta.ocr ?? ""} ${c.meta.domain ?? ""}`.toLowerCase().includes(q);
    })
    .slice(0, 4);
  const pinned = state.clips.find((c) => c.pinned);

  return (
    <div className="bento today">
      <AgentsBento />
      <InsightsCard />

      <article className="bento-card span-2">
        <span className="k">{next ? next.calendar : "Today"}</span>
        <strong>{next ? next.title : "Nothing on the calendar"}</strong>
        <em>
          {next
            ? `${next.start}–${next.end}${next.mins > 0 ? ` · in ${Math.round(next.mins)}m` : " · now"}`
            : "Cove still keeps what you copy."}
        </em>
      </article>

      <article className="bento-card">
        <span className="k">{state.focus.running ? "Focus" : "Next"}</span>
        <strong>{openTask?.title ?? "Inbox zero"}</strong>
        <em>{state.focus.running ? formatTime(state.focus.remainingMs) : "Start a pomodoro"}</em>
        {openTask ? (
          <button
            className="btn primary tight"
            onClick={() => {
              dispatch({ type: "focus-start", mode: "pomodoro", taskId: openTask.id });
              onOpen("focus");
            }}
          >
            Focus
          </button>
        ) : null}
      </article>

      {pinned ? (
        <button className="bento-card span-2 pin" onClick={() => onCopy(pinned.content)}>
          {pinned.kind === "color" ? <i className="sw" style={{ background: pinned.content }} /> : null}
          <span className="k">Pinned</span>
          <strong>{pinned.meta.colorName ?? pinned.preview}</strong>
          <em>{pinned.kind}</em>
        </button>
      ) : null}

      <article className="bento-card">
        <span className="k">Note</span>
        <strong>{note || "Empty"}</strong>
        <button className="btn ghost tight" onClick={() => onOpen("notes")}>
          Notes
        </button>
      </article>

      {clips.map((c) => (
        <button key={c.id} className="bento-card clip" onClick={() => onCopy(c.content)}>
          {c.kind === "color" || c.kind === "image" ? <i className="sw" style={{ background: c.content }} /> : null}
          <span className="k">{c.kind}</span>
          <strong>{c.kind === "color" ? c.meta.colorName ?? c.preview : c.preview}</strong>
        </button>
      ))}
    </div>
  );
}
