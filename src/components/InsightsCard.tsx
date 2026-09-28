import { formatTime } from "../lib";
import { useStore } from "../store";

function startOfWeek(now = Date.now()) {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function InsightsCard() {
  const { state } = useStore();
  const week = startOfWeek();
  const focusMs = state.focusLog
    .filter((s) => s.startedAt >= week)
    .reduce((n, s) => n + s.durationMs, 0);
  const done = state.tasks.filter((t) => t.done && (t.doneAt ?? t.createdAt) >= week).length;
  const clips = state.clips.filter((c) => c.createdAt >= week).length;
  const days = DAYS.map((label, i) => {
    const from = week + i * 86400000;
    const to = from + 86400000;
    const ms = state.focusLog
      .filter((s) => s.startedAt >= from && s.startedAt < to)
      .reduce((n, s) => n + s.durationMs, 0);
    return { label, ms };
  });
  const max = Math.max(1, ...days.map((d) => d.ms));
  const todayMs = days[(new Date().getDay() + 6) % 7]?.ms ?? 0;

  return (
    <article className="bento-card span-2 insights">
      <span className="k">This week</span>
      <strong>
        {formatTime(focusMs)} focus · {done} done
      </strong>
      <em>
        {clips} kept · {state.blockedSecrets} secrets held back
        {todayMs ? ` · ${formatTime(todayMs)} today` : ""}
      </em>
      <div className="insight-bars" aria-hidden="true">
        {days.map((d, i) => (
          <i key={`${d.label}-${i}`} style={{ height: `${Math.max(8, (d.ms / max) * 100)}%` }} title={d.label} />
        ))}
      </div>
    </article>
  );
}
