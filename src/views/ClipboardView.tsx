import { useMemo, useState, type CSSProperties } from "react";
import { AudioPlay } from "../components/AudioPlay";
import { BackupButtons } from "../components/BackupButtons";
import { ImagePlay } from "../components/ImagePlay";
import { SkinPicker } from "../components/SkinPicker";
import { Waveform } from "../components/Waveform";
import { pasteFaces } from "../faces";
import { formatTime, formatWhen } from "../lib";
import { makeClip, useStore } from "../store";
import type { Clip, ClipKind, Craft } from "../types";

const FILTERS: { id: ClipKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "color", label: "Colors" },
  { id: "image", label: "Shots" },
  { id: "svg", label: "SVG" },
  { id: "audio", label: "Voice" },
  { id: "code", label: "Code" },
  { id: "link", label: "Links" },
  { id: "path", label: "Paths" },
  { id: "timecode", label: "Time" },
];

const CRAFTS: Craft[] = ["Design", "Edit", "Code", "Life"];

export function ClipboardView({
  query,
  onCopy,
}: {
  query: string;
  onCopy: (content: string) => void;
}) {
  const { state, dispatch } = useStore();
  const [filter, setFilter] = useState<ClipKind | "all">("all");
  const [board, setBoard] = useState<string | "all">("all");
  const [mooding, setMooding] = useState(false);
  const q = query.trim().toLowerCase();

  const imageClips = state.clips.filter((c) => c.kind === "image" && c.content.startsWith("data:"));

  const makeMoodboard = async () => {
    const urls = imageClips.slice(0, 9).map((c) => c.content);
    if (urls.length < 2 || mooding) return;
    setMooding(true);
    try {
      const { composeMoodboard } = await import("../moodboard");
      const blob = await composeMoodboard(urls);
      const { saveBlob, thumbFromBlob } = await import("../blobDb");
      const clip = makeClip({
        kind: "image",
        content: "Moodboard",
        preview: "Moodboard",
        pinned: false,
        board: "Design",
        source: "Moodboard",
        meta: {},
      });
      clip.meta.imageId = clip.id;
      await saveBlob(clip.id, blob);
      try {
        const t = await thumbFromBlob(blob);
        clip.content = t.dataUrl;
        clip.meta.width = t.width;
        clip.meta.height = t.height;
        clip.preview = `Moodboard · ${urls.length}`;
      } catch {
        /* blob still saved */
      }
      dispatch({ type: "add-clip", clip });
    } finally {
      setMooding(false);
    }
  };

  const clips = useMemo(() => {
    return state.clips.filter((c) => {
      if (filter !== "all" && c.kind !== filter) return false;
      if (board !== "all" && c.board !== board) return false;
      if (!q) return true;
      const hay = `${c.preview} ${c.content} ${c.kind} ${c.board ?? ""} ${c.source} ${c.meta.ocr ?? ""} ${c.meta.colorName ?? ""} ${c.meta.domain ?? ""} ${c.meta.transcript ?? ""} ${c.meta.tokenName ?? ""} ${c.meta.pathName ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [board, filter, q, state.clips]);

  const colors = state.clips.filter((c) => c.kind === "color" || c.kind === "token");
  const pinned = clips.filter((c) => c.pinned);
  const rest = clips.filter((c) => !c.pinned);
  const counts = {
    design: state.clips.filter((c) => c.board === "Design").length,
    edit: state.clips.filter((c) => c.board === "Edit").length,
    code: state.clips.filter((c) => c.board === "Code").length,
    life: state.clips.filter((c) => c.board === "Life").length,
  };

  return (
    <>
      <div className="prefs-row">
        <SkinPicker />
        <div className="prefs-actions">
          {imageClips.length >= 2 ? (
            <button className="skin-chip" onClick={makeMoodboard} disabled={mooding}>
              {mooding ? "Composing…" : `Moodboard (${Math.min(imageClips.length, 9)})`}
            </button>
          ) : null}
          <BackupButtons />
        </div>
      </div>
      {state.lastBlockedAt && Date.now() - state.lastBlockedAt < 8000 ? (
        <div className="secret-banner">Roux covered his eyes. That secret never landed in Kept.</div>
      ) : null}

      {filter === "all" && !q && colors.length > 0 ? (
        <div className="palette" aria-label="Copied colors">
          {colors.map((c) => (
            <button
              key={c.id}
              className="swatch-chip"
              style={{ background: c.kind === "color" ? c.content : c.content.split(":")[1] ?? c.content }}
              title={c.meta.colorName ?? c.content}
              onClick={() => onCopy(c.kind === "color" ? c.content : (c.content.split(":")[1] ?? c.content).trim())}
            />
          ))}
        </div>
      ) : null}

      <div className="type-strip">
        <span>{counts.design} design</span>
        <span>{counts.edit} edit</span>
        <span>{counts.code} code</span>
        <span>{counts.life} life</span>
      </div>

      <div className="filters">
        <button className="chip" aria-pressed={board === "all"} onClick={() => setBoard("all")}>
          Every craft
        </button>
        {CRAFTS.map((b) => (
          <button key={b} className="chip" aria-pressed={board === b} onClick={() => setBoard(b)}>
            {b}
          </button>
        ))}
      </div>
      <div className="filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className="chip"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {pinned.length > 0 ? (
        <>
          <div className="section-title">
            <strong>Pinned</strong>
          </div>
          <div className="rail">
            {pinned.map((c) => (
              <ClipCard key={c.id} clip={c} onCopy={onCopy} />
            ))}
          </div>
        </>
      ) : null}

      <div className="section-title">
        <strong>History</strong>
        <span>{clips.length}</span>
      </div>
      {rest.length === 0 && pinned.length === 0 ? (
        <div className="empty">Nothing in this filter. Copy, paste a screenshot, or ask Roux to listen.</div>
      ) : (
        <div className="rail">
          {rest.map((c) => (
            <ClipCard key={c.id} clip={c} onCopy={onCopy} />
          ))}
        </div>
      )}
    </>
  );
}

function ClipCard({ clip, onCopy }: { clip: Clip; onCopy: (content: string) => void }) {
  const { dispatch } = useStore();
  const faces = pasteFaces(clip);
  return (
    <article className={`clip is-${clip.kind}`}>
      {clip.kind === "color" ? (
        <button className="color-face" style={{ background: clip.content }} onClick={() => onCopy(clip.content)}>
          <span>{clip.meta.colorName}</span>
          <b>{clip.content}</b>
        </button>
      ) : (
        <button className="thumb" onClick={() => onCopy(clip.meta.transcript ?? clip.content)} aria-label={`Copy ${clip.kind}`} style={thumbStyle(clip)}>
          {thumbLabel(clip)}
        </button>
      )}
      {clip.kind !== "color" ? (
        <div className="body">
          <div className="title">{headline(clip)}</div>
          <div className="meta">
            <span>{clip.kind}</span>
            <span>{clip.source}</span>
            <span>{formatWhen(clip.createdAt)}</span>
            {clip.board ? <span>{clip.board}</span> : null}
            {clip.kind === "audio" && clip.meta.durationMs ? <span>{formatTime(clip.meta.durationMs)}</span> : null}
            {clip.kind === "timecode" && clip.meta.seconds != null ? <span>{Math.round(clip.meta.seconds)}s</span> : null}
          </div>
          {clip.kind === "audio" ? <Waveform peaks={clip.meta.peaks ?? []} /> : null}
          {clip.kind === "audio" && clip.meta.audioId ? <AudioPlay id={clip.meta.audioId} /> : null}
          {clip.kind === "image" ? <ImagePlay id={clip.meta.imageId} fallback={clip.content} /> : null}
          {clip.kind === "svg" ? (
            <img className="shot svg-shot" alt="" src={`data:image/svg+xml;utf8,${encodeURIComponent(clip.content)}`} />
          ) : null}
          {clip.kind === "code" ? <pre className="code-peek">{clip.content.split("\n").slice(0, 3).join("\n")}</pre> : null}
          {clip.meta.ocr ? <div className="ocr">{clip.meta.ocr}</div> : null}
          {clip.kind === "audio" ? (
            <textarea
              className="transcript"
              defaultValue={clip.meta.transcript ?? ""}
              placeholder="Edit the transcript"
              onBlur={(e) => dispatch({ type: "set-transcript", id: clip.id, transcript: e.target.value })}
            />
          ) : null}
          <div className="faces">
            {faces.map((f) => (
              <button key={f.id} className="face" onClick={() => onCopy(f.value)} title={f.value}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="body">
          <div className="meta">
            <span>{clip.source}</span>
            <span>{formatWhen(clip.createdAt)}</span>
            {clip.board ? <span>{clip.board}</span> : null}
          </div>
          <div className="faces">
            {faces.map((f) => (
              <button key={f.id} className="face" onClick={() => onCopy(f.value)} title={f.value}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="actions">
        <button className="icon-btn" aria-pressed={clip.pinned} title="Pin" onClick={() => dispatch({ type: "toggle-pin", id: clip.id })}>
          {clip.pinned ? "★" : "☆"}
        </button>
        <button
          className="icon-btn"
          title="Turn into a task"
          onClick={() => dispatch({ type: "add-task", title: clip.meta.transcript ?? clip.preview, fromClipId: clip.id })}
        >
          +
        </button>
      </div>
    </article>
  );
}

function headline(clip: Clip) {
  if (clip.kind === "link") return clip.meta.domain ?? clip.preview;
  if (clip.kind === "code") return clip.meta.language ?? "Code";
  if (clip.kind === "audio") return clip.meta.transcript || "Voice note";
  if (clip.kind === "token") return clip.meta.tokenName ?? "Token";
  if (clip.kind === "path") return clip.meta.pathName ?? clip.preview;
  if (clip.kind === "timecode") return clip.content;
  if (clip.kind === "svg") return "SVG";
  if (clip.kind === "image") return clip.preview || "Screenshot";
  return clip.preview;
}

function thumbLabel(clip: Clip) {
  if (clip.kind === "image") return "";
  if (clip.kind === "link") return "url";
  if (clip.kind === "code") return clip.meta.language?.slice(0, 3).toLowerCase() ?? "{ }";
  if (clip.kind === "file" || clip.kind === "path") return "file";
  if (clip.kind === "audio") return "mic";
  if (clip.kind === "svg") return "svg";
  if (clip.kind === "token") return "var";
  if (clip.kind === "timecode") return "tc";
  return "Aa";
}

function thumbStyle(clip: Clip): CSSProperties {
  if (clip.kind === "image") return { background: clip.content.startsWith("data:") || clip.content.includes("gradient") ? clip.content : "#1c1824" };
  if (clip.kind === "token" && clip.content.includes("#")) {
    const hex = clip.content.match(/#[0-9a-fA-F]{3,8}/)?.[0];
    if (hex) return { background: hex };
  }
  return {};
}
