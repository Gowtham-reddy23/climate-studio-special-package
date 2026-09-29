const PLACES = [
  { name: "Today", tone: "today", line: "Focus, tasks, a scratch note, calendar, and water." },
  { name: "Clipboard", tone: "clips", line: "What you copy, with a preview and pins." },
  { name: "Tasks", tone: "tasks", line: "Today, next, and later. Focus, remind, or save as a note." },
  { name: "Notes", tone: "notes", line: "A notepad, voice notes that keep the recording, and lists." },
];

export function IntroLayer({ onDone }: { onDone: () => void }) {
  return (
    <div className="intro-layer" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <header>
        <strong id="intro-title">Climate Studio Special Package</strong>
        <p>Lives in the camera notch, above the app you are in. Keys 1–4 switch sections.</p>
      </header>
      <ul>
        {PLACES.map((place) => (
          <li key={place.name} data-tone={place.tone}>
            <strong>{place.name}</strong>
            <span>{place.line}</span>
          </li>
        ))}
      </ul>
      <p className="intro-note">Time spent counts focus sessions here. It does not read Mac Screen Time.</p>
      <button type="button" className="btn primary" onClick={onDone}>
        Start
      </button>
    </div>
  );
}
