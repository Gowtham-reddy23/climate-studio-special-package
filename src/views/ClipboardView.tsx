import { useMemo, useState } from "react";
import { AudioPlay } from "../components/AudioPlay";
import { BackupButtons } from "../components/BackupButtons";
import { ImagePlay } from "../components/ImagePlay";
import { Waveform } from "../components/Waveform";
import { pasteFaces } from "../faces";
import { formatTime, formatWhen } from "../lib";
import { isNativeApp, openLink, removeBackground, revealPath } from "../native";
import { makeClip, useStore } from "../store";
import type { Clip, ClipKind } from "../types";

const FILTERS: { id: ClipKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "text", label: "Text" },
  { id: "color", label: "Colors" },
  { id: "image", label: "Shots" },
  { id: "svg", label: "SVG" },
  { id: "audio", label: "Voice" },
  { id: "code", label: "Code" },
  { id: "link", label: "Links" },
  { id: "path", label: "Paths" },
  { id: "timecode", label: "Time" },
];

export function ClipboardView({
  query,
  onCopy,
}: {
  query: string;
  onCopy: (content: string) => void;
}) {
  const { state, dispatch } = useStore();
  const [filter, setFilter] = useState<ClipKind | "all">("all");
  const [mooding, setMooding] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
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
      if (!q) return true;
      const hay = `${c.preview} ${c.content} ${c.kind} ${c.board ?? ""} ${c.source} ${c.meta.ocr ?? ""} ${c.meta.colorName ?? ""} ${c.meta.domain ?? ""} ${c.meta.transcript ?? ""} ${c.meta.tokenName ?? ""} ${c.meta.pathName ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filter, q, state.clips]);

  const colors = state.clips.filter((c) => c.kind === "color" || c.kind === "token");
  const pinned = clips.filter((c) => c.pinned);

  const active = clips.find((c) => c.id === activeId) ?? clips[0] ?? null;

  return (
    <>
      {state.lastBlockedAt && Date.now() - state.lastBlockedAt < 8000 ? (
        <div className="secret-banner">Roux covered his eyes. That secret never landed in the clipboard.</div>
      ) : null}
      <div className="clip-board is-hist">
          <section className="ws-card is-tasks">
            <header>
              <strong>History</strong>
              <span>{clips.length}</span>
            </header>
            <div className="ws-kinds">
              {FILTERS.map((f) => (
                <button key={f.id} className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            {clips.length === 0 ? <p className="ws-empty">Nothing in this filter.</p> : null}
            <ul>
              {clips.map((c) => (
                <li key={c.id} className={active?.id === c.id ? "is-on" : ""}>
                  <button className="ws-clip" onClick={() => setActiveId(c.id)}>
                    <ClipMark clip={c} />
                    <span>{headline(c)}</span>
                    <time>{formatWhen(c.createdAt)}</time>
                  </button>
                  <button type="button" className="clip-x" title="Delete" onClick={() => dispatch({ type: "remove-clip", id: c.id })}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>

        <section className="ws-card is-stage">
          <header>
            <strong>Preview</strong>
            <span>{active ? active.kind : "Empty"}</span>
          </header>
          {active ? <ClipCard clip={active} onCopy={onCopy} /> : <p className="ws-empty">Copy something and it shows up here.</p>}
        </section>

        <section className="ws-card is-pins">
          <header>
            <strong>Pinned</strong>
            <span>{pinned.length}</span>
          </header>
          {pinned.length === 0 ? <p className="ws-empty">Pin a clip to keep it here.</p> : null}
          <ul>
            {pinned.map((c) => (
              <li key={c.id} className={active?.id === c.id ? "is-on" : ""}>
                <button className="ws-clip" onClick={() => setActiveId(c.id)}>
                  <ClipMark clip={c} />
                  <span>{headline(c)}</span>
                </button>
                <button type="button" className="clip-x" title="Delete" onClick={() => dispatch({ type: "remove-clip", id: c.id })}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          {colors.length ? (
            <div className="ws-swatches">
              {colors.slice(0, 10).map((c) => {
                const hex = c.kind === "color" ? c.content : (c.content.split(":")[1] ?? c.content).trim();
                return (
                  <button key={c.id} style={{ background: hex }} title={c.meta.colorName ?? hex} onClick={() => setActiveId(c.id)} />
                );
              })}
            </div>
          ) : null}
          <footer>
            {imageClips.length >= 2 ? (
              <button className="ws-more" onClick={makeMoodboard} disabled={mooding}>
                {mooding ? "…" : "Board"}
              </button>
            ) : null}
            <BackupButtons />
          </footer>
        </section>
      </div>
    </>
  );
}

function ClipCard({ clip, onCopy }: { clip: Clip; onCopy: (content: string) => void }) {
  const { dispatch } = useStore();
  const [cutting, setCutting] = useState(false);
  const [reading, setReading] = useState(false);
  const [showText, setShowText] = useState(false);
  const faces = pasteFaces(clip).filter((f) => f.id !== "raw" && !(clip.kind === "image" && f.id === "ocr"));

  const readText = async () => {
    if (reading) return;
    setReading(true);
    try {
      const { loadBlob } = await import("../blobDb");
      const { ocrImage } = await import("../native");
      let src: Blob | null = clip.meta.imageId ? await loadBlob(clip.meta.imageId) : null;
      if (!src && clip.content.startsWith("data:")) src = await fetch(clip.content).then((r) => r.blob());
      if (!src) return;
      const text = await ocrImage(src);
      if (text) {
        dispatch({ type: "set-ocr", id: clip.id, ocr: text });
        setShowText(true);
      }
    } finally {
      setReading(false);
    }
  };

  const cutOut = async () => {
    if (cutting) return;
    setCutting(true);
    try {
      const { loadBlob, saveBlob, thumbFromBlob } = await import("../blobDb");
      let src: Blob | null = clip.meta.imageId ? await loadBlob(clip.meta.imageId) : null;
      if (!src && clip.content.startsWith("data:")) {
        src = await fetch(clip.content).then((r) => r.blob());
      }
      if (!src) return;
      const cut = await removeBackground(src);
      if (!cut) return;
      const next = makeClip({
        kind: "image",
        content: "Cutout",
        preview: "Cutout",
        pinned: false,
        board: "Design",
        source: "Remove BG",
        meta: {},
      });
      next.meta.imageId = next.id;
      await saveBlob(next.id, cut);
      try {
        const t = await thumbFromBlob(cut);
        next.content = t.dataUrl;
        next.meta.width = t.width;
        next.meta.height = t.height;
        next.preview = "Background removed";
      } catch {
        /* blob saved */
      }
      dispatch({ type: "add-clip", clip: next });
    } finally {
      setCutting(false);
    }
  };

  const body = previewText(clip);

  return (
    <article className={`preview is-${clip.kind}`}>
      <div className="preview-stage">
        {clip.kind === "color" ? (
          <button className="color-face" style={{ background: clip.content }} onClick={() => onCopy(clip.content)}>
            <span>{clip.meta.colorName ?? "Color"}</span>
            <b>{clip.content}</b>
          </button>
        ) : null}
        {clip.kind === "image" ? <ImagePlay id={clip.meta.imageId} fallback={clip.content} /> : null}
        {clip.kind === "svg" ? (
          <img className="shot svg-shot" alt="" src={`data:image/svg+xml;utf8,${encodeURIComponent(clip.content)}`} />
        ) : null}
        {clip.kind === "audio" ? (
          <div className="preview-voice">
            <Waveform peaks={clip.meta.peaks ?? []} />
            {clip.meta.audioId ? (
              <AudioPlay id={clip.meta.audioId} />
            ) : (
              <p className="preview-missing">No audio file on this Mac.</p>
            )}
            <textarea
              key={clip.id}
              className="transcript"
              defaultValue={clip.meta.transcript ?? (clip.content === "Voice note" ? "" : clip.content)}
              placeholder="Transcript"
              onBlur={(e) => dispatch({ type: "set-transcript", id: clip.id, transcript: e.target.value })}
            />
          </div>
        ) : null}
        {clip.kind === "code" ? <pre className="code-peek">{clip.content.split("\n").slice(0, 14).join("\n")}</pre> : null}
        {clip.kind === "link" ? (
          <button className="preview-link" onClick={() => void openLink(linkOf(clip))}>
            <b>{clip.meta.domain ?? "Link"}</b>
            <span>{linkOf(clip)}</span>
          </button>
        ) : null}
        {clip.kind === "text" || clip.kind === "path" || clip.kind === "file" || clip.kind === "token" || clip.kind === "timecode" ? (
          <p className="preview-lead">{body || headline(clip)}</p>
        ) : null}
      </div>
      {body && clip.kind !== "audio" && clip.kind !== "image" && clip.kind !== "text" && clip.kind !== "code" && clip.kind !== "path" && clip.kind !== "file" && clip.kind !== "token" && clip.kind !== "timecode" ? (
        <p className="preview-body">{body}</p>
      ) : null}
      <div className="preview-meta">
        <span>{clip.source}</span>
        <span>{formatWhen(clip.createdAt)}</span>
        {clip.kind === "audio" && clip.meta.durationMs ? <span>{formatTime(clip.meta.durationMs)}</span> : null}
        {clip.kind === "image" && clip.meta.width ? <span>{clip.meta.width}×{clip.meta.height}</span> : null}
      </div>
      <div className="preview-actions">
        <button className="icon-btn" onClick={() => onCopy(clip.kind === "audio" ? clip.meta.transcript ?? clip.content : clip.kind === "link" ? linkOf(clip) : clip.content)}>
          Copy
        </button>
        {clip.kind === "path" || clip.kind === "file" ? (
          <button className="icon-btn" onClick={() => void revealPath(clip.content)}>
            View
          </button>
        ) : null}
        {clip.kind === "link" ? (
          <button className="icon-btn" onClick={() => void openLink(linkOf(clip))}>
            Open
          </button>
        ) : null}
        <button className="icon-btn" aria-pressed={clip.pinned} onClick={() => dispatch({ type: "toggle-pin", id: clip.id })}>
          {clip.pinned ? "Pinned" : "Pin"}
        </button>
        <button
          className="icon-btn"
          onClick={() => dispatch({ type: "add-task", title: clip.meta.transcript ?? headline(clip), fromClipId: clip.id })}
        >
          Task
        </button>
        <button className="icon-btn" onClick={() => dispatch({ type: "remove-clip", id: clip.id })}>
          Remove
        </button>
      </div>
      {clip.kind === "image" ? (
        <div className="preview-tools">
          <button
            className="icon-btn"
            disabled={reading}
            onClick={() => {
              if (clip.meta.ocr) {
                setShowText((v) => !v);
                return;
              }
              void readText();
            }}
          >
            {reading ? "Reading…" : "Read text"}
          </button>
          {isNativeApp() ? (
            <button className="icon-btn" onClick={cutOut} disabled={cutting}>
              {cutting ? "Cutting…" : "Remove background"}
            </button>
          ) : null}
        </div>
      ) : null}
      {showText && clip.meta.ocr ? <p className="preview-body">{clip.meta.ocr}</p> : null}
      {faces.length ? (
        <div className="faces">
          {faces.map((f) => (
            <button key={f.id} className="face" onClick={() => onCopy(f.value)} title={f.value}>
              {f.label}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function linkOf(clip: Clip) {
  const raw = clip.content.trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (clip.meta.domain) return `https://${clip.meta.domain}`;
  return raw;
}

function ClipMark({ clip }: { clip: Clip }) {
  if (clip.kind === "color") return <i className="clip-mark is-swatch" style={{ background: clip.content }} />;
  if (clip.kind === "image" && clip.content.startsWith("data:image") && clip.content.length < 24000) {
    return <i className="clip-mark is-shot" style={{ backgroundImage: `url(${clip.content})` }} />;
  }
  return (
    <i className={`clip-mark is-${clip.kind}`}>
      <KindIcon kind={clip.kind} />
    </i>
  );
}

function KindIcon({ kind }: { kind: Clip["kind"] }) {
  if (kind === "link") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6.5 9.5l3-3" />
        <path d="M7.2 5.2l.8-.8a2.4 2.4 0 0 1 3.4 3.4l-.8.8" />
        <path d="M8.8 10.8l-.8.8a2.4 2.4 0 0 1-3.4-3.4l.8-.8" />
      </svg>
    );
  }
  if (kind === "image" || kind === "svg") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.6" />
        <path d="M2.6 10.2l2.6-2.4 2.2 2 1.6-1.4 3.2 2.8" />
        <circle cx="6" cy="6.2" r="0.8" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === "audio") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="6.2" y="2" width="3.6" height="6.4" rx="1.8" />
        <path d="M4.4 7.2a3.6 3.6 0 0 0 7.2 0M8 10.8V13" />
      </svg>
    );
  }
  if (kind === "code" || kind === "token") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6 4.5L3.2 8 6 11.5M10 4.5L12.8 8 10 11.5" />
      </svg>
    );
  }
  if (kind === "path" || kind === "file") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2.4 4.2h3.2l1.2 1.4h6.8v6.6a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1z" />
      </svg>
    );
  }
  if (kind === "timecode") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="5.2" />
        <path d="M8 5.2V8l2 1.4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.2 4.2h9.6M3.2 8h9.6M3.2 11.8h6.2" />
    </svg>
  );
}

function previewText(clip: Clip) {
  if (clip.kind === "audio") return (clip.meta.transcript ?? "").trim();
  if (clip.kind === "image") return "";
  if (clip.kind === "link") return linkOf(clip);
  if (clip.preview.startsWith("data:") || clip.content.startsWith("data:")) return (clip.meta.ocr ?? "").trim();
  return clip.content.trim();
}

function headline(clip: Clip) {
  if (clip.kind === "image" || clip.preview.startsWith("data:") || clip.content.startsWith("data:image")) {
    return clip.preview && !clip.preview.startsWith("data:") && clip.preview.length < 48 ? clip.preview : "Screenshot";
  }
  if (clip.kind === "link") return clip.meta.domain ?? clip.preview;
  if (clip.kind === "code") return clip.meta.language ?? "Code";
  if (clip.kind === "audio") return clip.meta.transcript || "Voice note";
  if (clip.kind === "token") return clip.meta.tokenName ?? "Token";
  if (clip.kind === "path") return clip.meta.pathName ?? clip.preview;
  if (clip.kind === "timecode") return clip.content;
  if (clip.kind === "svg") return "SVG";
  return clip.preview;
}

