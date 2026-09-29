import { eventMinutesFromNow } from "../lib";
import { useStore } from "../store";

export function CalendarView({ query }: { query: string }) {
  const { state } = useStore();
  const q = query.trim().toLowerCase();
  const events = state.events.filter((e) => e.title.toLowerCase().includes(q) || e.calendar.toLowerCase().includes(q));

  return (
    <>
      <div className="section-title">
        <strong>Calendar</strong>
        <span>Google Calendar</span>
      </div>
      {events.length === 0 ? (
        <div className="empty">No Google Calendar events match.</div>
      ) : (
        events.map((e) => {
          const mins = eventMinutesFromNow(e.start);
          return (
            <div key={e.id} className="event">
              <div className="when">
                {e.start}
                <div style={{ color: "var(--muted)", marginTop: 4 }}>{e.end}</div>
              </div>
              <div>
                <div className="title">{e.title}</div>
                <div className="meta">
                  {e.calendar}
                  {mins > 0 ? ` · in ${Math.round(mins)}m` : mins > -30 ? " · now" : ""}
                </div>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
