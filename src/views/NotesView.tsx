import { useState } from "react";
import { NoteEditor } from "../components/NoteEditor";
import { formatTime } from "../lib";
import { splitNote } from "../noteFiles";
import { Waveform } from "../components/Waveform";
import { AudioPlay } from "../components/AudioPlay";
import { todayKey } from "../lib";
import { useStore } from "../store";
import type { Clip, Note } from "../types";

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
  const [openId, setOpenId] = useState<string | null>(null);
  const [filed, setFiled] = useState(false);
  const notes = [...(state.notes ?? [])].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  const isVoice = (n: Note) => n.via === "voice" || n.title === "Voice note" || Boolean(n.audioId);
  const pages = notes.filter((n) => n.kind !== "list" && !isVoice(n));
  const voices = notes.filter((n) => isVoice(n));
  const lists = notes.filter((n) => n.kind === "list");
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  const filePage = () => {
    const body = text.trim();
    if (!body) return;
    const line = splitNote(body).prose.split("\n").map((s) => s.trim()).find(Boolean) ?? "Note";
    const title = line.length > 64 ? `${line.slice(0, 61)}…` : line;
    const same = pages.find((p) => p.body.trim() === body);
    if (!same) dispatch({ type: "add-note", title, kind: "write", body });
    dispatch({ type: "set-note", day, text: "" });
    setFiled(true);
    window.setTimeout(() => setFiled(false), 1400);
  };

  return (
    <div className="workspace note-board">
      <section className="ws-card is-scratch">
        <header>
          <strong>Notepad</strong>
          <span>{words} {words === 1 ? "word" : "words"}</span>
        </header>
        {error ? <p className="ws-empty">{error}</p> : null}
        <NoteEditor
          value={text}
          placeholder="Write the page. Type / to format, or to add a link, image, or PDF. The first line is the title."
          onChange={(next) => {
            setFiled(false);
            dispatch({ type: "set-note", day, text: next });
          }}
          onCommandEnter={(line) => dispatch({ type: "add-task", title: line, when: "today" })}
        />
        {pages.length === 0 ? null : (
          <div className="note-stack">
            {pages.map((note) =>
              openId === note.id ? (
                <NoteCard key={note.id} note={note} />
              ) : (
                <button key={note.id} className="page-row" type="button" onClick={() => setOpenId(note.id)}>
                  <strong>{note.title || "Note"}</strong>
                  <span>{note.body.replace(/\s+/g, " ").slice(0, 72)}</span>
                </button>
              ),
            )}
          </div>
        )}
        <footer>
          <span className="ws-micro">
            <button className={`note-save ${filed ? "is-saved" : ""}`} type="button" disabled={!text.trim()} onClick={filePage}>
              {filed ? "Saved" : "Save note"}
            </button>
          </span>
        </footer>
      </section>

      <section className="ws-card is-voice">
        <header>
          <strong>Voice</strong>
          <span>{recording ? formatTime(elapsedMs) : voices.length}</span>
        </header>
        {recording ? (
          <div className="listen-card is-live">
            <div className="listen-meta">
              <span className="listen-dot" />
              <strong>{speechAvailable ? "Transcribing" : "Saving audio"}</strong>
            </div>
            <Waveform peaks={peaks.length ? peaks : Array.from({ length: 24 }, () => 0.12)} live={level} />
            <p className="listen-text">{partial || "Speak — Roux is writing it down."}</p>
          </div>
        ) : voices.length === 0 ? (
          <p className="ws-empty">Record here. The words and the audio stay in this card.</p>
        ) : null}
        {voices.length === 0 ? null : (
          <div className="note-stack">
            {voices.map((note) => (
              <VoiceCard key={note.id} note={note} clips={state.clips} />
            ))}
          </div>
        )}
        <footer>
          <span className="ws-micro">
            <button type="button" onClick={onListen}>
              {recording ? "Save voice" : "Record"}
            </button>
            {recording ? (
              <button type="button" onClick={onCancel}>
                Discard
              </button>
            ) : null}
          </span>
        </footer>
      </section>

      <section className="ws-card is-lists">
        <header>
          <strong>Lists</strong>
          <span>{lists.length}</span>
        </header>
        {lists.length === 0 ? <p className="ws-empty">Checklists live here.</p> : null}
        <div className="note-stack">
          {lists.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
        <footer>
          <span className="ws-micro">
            <button type="button" onClick={() => dispatch({ type: "add-note", title: "List", kind: "list" })}>
              New list
            </button>
          </span>
        </footer>
      </section>
    </div>
  );
}

function WriteNote({ note }: { note: Note }) {
  const { dispatch } = useStore();
  return (
    <NoteEditor
      value={note.body}
      placeholder="Type / to format, or to add a link, image, or PDF."
      onChange={(body) => dispatch({ type: "update-note", id: note.id, body })}
    />
  );
}

function taskLine(note: Note) {
  const line = splitNote(note.body)
    .prose.split("\n")
    .map((s) => s.replace(/^- \[[ x]\] ?/, "").trim())
    .find(Boolean);
  return line || note.title || "Task";
}

function audioFor(note: Note, clips: Clip[]) {
  if (note.audioId) return note.audioId;
  const body = note.body.trim();
  if (!body) return undefined;
  const hit = clips.find(
    (c) => c.kind === "audio" && c.meta.audioId && (c.meta.transcript ?? c.content).trim() === body,
  );
  return hit?.meta.audioId;
}

function VoiceCard({ note, clips }: { note: Note; clips: Clip[] }) {
  const { dispatch } = useStore();
  const audioId = audioFor(note, clips);

  return (
    <article className={`note-card ${note.pinned ? "is-pin" : ""}`}>
      <header>
        <input
          value={note.title}
          onChange={(e) => dispatch({ type: "update-note", id: note.id, title: e.target.value })}
        />
        {note.durationMs ? <span>{formatTime(note.durationMs)}</span> : null}
        <button
          className="icon-btn"
          aria-pressed={note.pinned}
          title="Pin"
          onClick={() => dispatch({ type: "update-note", id: note.id, pinned: !note.pinned })}
        >
          {note.pinned ? "★" : "☆"}
        </button>
        <button className="icon-btn" title="Remove" onClick={() => dispatch({ type: "remove-note", id: note.id })}>
          ×
        </button>
      </header>
      {audioId ? <AudioPlay id={audioId} /> : <p className="ws-empty">Transcript only — this one has no audio file.</p>}
      <textarea
        value={note.body}
        placeholder="Add the words if the transcript missed them."
        onChange={(e) => dispatch({ type: "update-note", id: note.id, body: e.target.value })}
      />
      <span className="ws-micro">
        <button type="button" title="Turn this note into a task" onClick={() => dispatch({ type: "add-task", title: taskLine(note), when: "today" })}>
          Task
        </button>
      </span>
    </article>
  );
}

function NoteCard({ note }: { note: Note }) {
  const { dispatch } = useStore();
  const lines = note.body.split("\n");

  return (
    <article className={`note-card ${note.pinned ? "is-pin" : ""}`}>
      <header>
        <input
          value={note.title}
          onChange={(e) => dispatch({ type: "update-note", id: note.id, title: e.target.value })}
        />
        <button
          className="icon-btn"
          aria-pressed={note.pinned}
          title="Pin"
          onClick={() => dispatch({ type: "update-note", id: note.id, pinned: !note.pinned })}
        >
          {note.pinned ? "★" : "☆"}
        </button>
        <button className="icon-btn" title="Remove" onClick={() => dispatch({ type: "remove-note", id: note.id })}>
          ×
        </button>
      </header>
      {note.kind === "list" ? (
        <div className="note-list">
          {lines.map((line, i) => {
            const on = line.startsWith("- [x]");
            const label = line.replace(/^- \[[ x]\] ?/, "");
            return (
              <label key={i}>
                <button
                  className="check"
                  type="button"
                  aria-checked={on}
                  onClick={() => dispatch({ type: "toggle-note-line", id: note.id, index: i })}
                />
                <input
                  value={label}
                  placeholder="List item"
                  onChange={(e) => {
                    const next = [...lines];
                    next[i] = `${on ? "- [x]" : "- [ ]"} ${e.target.value}`;
                    dispatch({ type: "update-note", id: note.id, body: next.join("\n") });
                  }}
                />
              </label>
            );
          })}
          <button
            className="btn ghost tight"
            onClick={() => dispatch({ type: "update-note", id: note.id, body: `${note.body}\n- [ ] ` })}
          >
            Add line
          </button>
        </div>
      ) : (
        <WriteNote note={note} />
      )}
      <span className="ws-micro">
        <button type="button" title="Turn this note into a task" onClick={() => dispatch({ type: "add-task", title: taskLine(note), when: "today" })}>
          Task
        </button>
      </span>
    </article>
  );
}
