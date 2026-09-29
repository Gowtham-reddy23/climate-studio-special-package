import { useCallback, useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { IntroLayer } from "./components/IntroLayer";
import { NotchDock } from "./components/NotchDock";
import { SettingsWindow } from "./components/SettingsWindow";
import { Roux } from "./components/Pebble";
import { Waveform } from "./components/Waveform";
import { useRecorder } from "./hooks/useRecorder";
import { classify, formatClock, formatDay, formatTime, isSecret, waterIsDue } from "./lib";
import { calendarEvents, installUpdate, isNativeApp, listenNativeClipboard, listenSkipPaste, peekUpdate, quitCove, syncPasteSlots, syncWindow } from "./native";
import { makeClip, useStore } from "./store";
import { useIsland } from "./island/useIsland";
import type { ClipKind, Mood, Tab } from "./types";
import { ClipboardView } from "./views/ClipboardView";
import { NotesView } from "./views/NotesView";
import { TasksView } from "./views/TasksView";
import { TodayView } from "./views/TodayView";

const INTRO_KEY = "cove.intro";

function introPending() {
  try {
    return localStorage.getItem(INTRO_KEY) !== "1";
  } catch {
    return false;
  }
}

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "kept", label: "Clipboard" },
  { id: "tasks", label: "Tasks" },
  { id: "notes", label: "Notes" },
];

export function App() {
  const { state, dispatch } = useStore();
  const native = isNativeApp();
  const [open, setOpen] = useState(native);
  const [pinned, setPinned] = useState(native);
  const [instant, setInstant] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [query, setQuery] = useState("");
  const [clock, setClock] = useState(formatClock);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [intro, setIntro] = useState(introPending);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const openedByKey = useRef(native);
  const pinnedRef = useRef(native);
  const recorder = useRecorder();

  const finishIntro = useCallback(() => {
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* private mode */
    }
    setIntro(false);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1400);
  }, []);

  useEffect(() => {
    if (!native) return;
    void peekUpdate()
      .then(setUpdateVersion)
      .catch(() => setUpdateVersion(null));
  }, [native]);

  const runUpdate = useCallback(() => {
    setUpdating(true);
    void installUpdate().catch(() => {
      setUpdating(false);
      showToast("Update failed");
    });
  }, [showToast]);

  const keep = useCallback(
    (raw: string, extra?: Parameters<typeof classify>[1]) => {
      const text = raw.trim();
      if (!text) return;
      if (isSecret(text)) {
        dispatch({ type: "secret-blocked" });
        showToast("Secret held back");
        return;
      }
      const clip = makeClip({ ...classify(text, extra), source: extra?.source ?? "Clipboard" });
      dispatch({ type: "add-clip", clip });
      showToast(`Kept ${clip.kind}`);
      if (!open) {
        setTab("kept");
      }
    },
    [dispatch, open, showToast],
  );

  const keepImage = useCallback(
    async (blob: Blob, source = "Screenshot", ocr?: string) => {
      const clip = makeClip({
        kind: "image",
        content: "Screenshot",
        preview: source === "Screenshot" ? "Screenshot" : "Image",
        pinned: false,
        board: source === "Screenshot" ? "Life" : "Design",
        source,
        meta: ocr ? { ocr } : {},
      });
      clip.meta.imageId = clip.id;
      const { saveBlob, thumbFromBlob } = await import("./blobDb");
      await saveBlob(clip.id, blob);
      try {
        const thumb = await thumbFromBlob(blob);
        clip.content = thumb.dataUrl;
        clip.meta.width = thumb.width;
        clip.meta.height = thumb.height;
        clip.preview = `${thumb.width}×${thumb.height}`;
      } catch {
        /* blob still stored */
      }
      dispatch({ type: "add-clip", clip });
      showToast("Kept screenshot");
      setTab("kept");
    },
    [dispatch, showToast],
  );

  const keepVoice = useCallback(
    async (result: { transcript: string; durationMs: number; peaks: number[]; blob: Blob | null; engine: "live" | "audio-only" }) => {
      const transcript = result.transcript.trim();
      const clip = makeClip({
        kind: "audio",
        content: transcript || "Voice note",
        preview: transcript || "Voice note",
        pinned: false,
        board: "Edit",
        source: "Roux",
        meta: {
          durationMs: result.durationMs,
          peaks: result.peaks,
          transcript: transcript || undefined,
          audioId: undefined,
          engine: result.engine,
        },
      });
      if (result.blob) {
        clip.meta.audioId = clip.id;
        const { saveBlob } = await import("./blobDb");
        await saveBlob(clip.id, result.blob);
      }
      if (!result.blob && !transcript) {
        showToast("Nothing to keep");
        return;
      }
      dispatch({ type: "add-clip", clip });
      const title = transcript.split(/\s+/).slice(0, 6).join(" ") || "Voice note";
      dispatch({
        type: "add-note",
        title,
        kind: "write",
        body: transcript,
        via: "voice",
        audioId: result.blob ? clip.id : undefined,
        durationMs: result.durationMs,
        peaks: result.peaks,
      });
      showToast(result.blob ? "Voice note saved" : "Transcript saved — no audio this time");
      setTab("notes");
    },
    [dispatch, showToast],
  );

  useEffect(() => {
    const onCopy = () => {
      const text = window.getSelection()?.toString();
      if (text) keep(text, { source: "This Mac" });
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, [keep]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const dt = e.clipboardData;
      if (!dt) return;
      const file = [...dt.files].find((f) => f.type.startsWith("image/"));
      const item = [...dt.items].find((i) => i.type.startsWith("image/"));
      const blob = file ?? item?.getAsFile();
      if (blob) {
        e.preventDefault();
        void keepImage(blob, "Screenshot");
        return;
      }
      const text = dt.getData("text/plain");
      if (text) keep(text, { source: "Clipboard" });
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [keep, keepImage]);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      void keepImage(file, "Screenshot");
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [keepImage]);

  useEffect(() => {
    document.documentElement.classList.toggle("native", isNativeApp());
    void syncWindow(open, sheet ? "settings" : state.layout);
  }, [open, sheet, state.layout]);

  useEffect(() => {
    document.documentElement.dataset.skin = state.skin;
  }, [state.skin]);

  useEffect(() => {
    if (!isNativeApp()) return;
    let alive = true;
    const pull = () => {
      void calendarEvents().then((events) => {
        if (!alive || !events) return;
        dispatch({ type: "set-events", events });
      });
    };
    pull();
    const id = window.setInterval(pull, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [dispatch]);

  useEffect(() => {
    let stop = () => undefined as void;
    void listenNativeClipboard(
      (text, source, kind) =>
        keep(text, kind === "path" ? { kind: "path", source: source || "Finder" } : { source }),
      (blob, source, ocr) => void keepImage(blob, source, ocr),
    ).then((un) => {
      stop = un;
    });
    return () => stop();
  }, [keep, keepImage]);

  useEffect(() => {
    let stop = () => undefined as void;
    void listenSkipPaste((index) => {
      showToast(`Pasted clip ${index + 1}`);
    }).then((un) => {
      stop = un;
    });
    return () => stop();
  }, [showToast]);

  useEffect(() => {
    void syncPasteSlots(
      state.clips.slice(0, 10).map((c) => ({
        text: c.kind === "image" ? c.meta.ocr || c.preview : c.meta.transcript ?? c.content,
      })),
    );
  }, [state.clips]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setClock(formatClock());
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!state.focus.running) return;
    const id = window.setInterval(() => {
      dispatch({ type: "focus-delta", ms: 500 });
    }, 500);
    return () => window.clearInterval(id);
  }, [dispatch, state.focus.running]);

  useEffect(() => {
    if (state.focus.running && state.focus.mode !== "watch" && state.focus.remainingMs <= 0) {
      dispatch({ type: "focus-stop" });
      showToast("Focus session ended");
    }
  }, [dispatch, showToast, state.focus]);

  const suspendClose = useRef(0);
  const setOpenMode = useCallback((next: boolean, fromKey = false) => {
    openedByKey.current = fromKey;
    setInstant(fromKey);
    setOpen(next);
    if (next) suspendClose.current = Date.now() + 800;
    if (!next) {
      setPinned(false);
      pinnedRef.current = false;
      setSheet(false);
    }
  }, []);

  const toggleListen = useCallback(async () => {
    if (recorder.recording) {
      const result = await recorder.stop();
      if (result) await keepVoice(result);
      return;
    }
    setOpenMode(true, true);
    setTab("notes");
    await recorder.start();
  }, [keepVoice, recorder, setOpenMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if ((e.altKey && (e.key === "n" || e.key === "N")) || (meta && e.key === "\\")) {
        e.preventDefault();
        setOpenMode(!open, true);
        return;
      }
      if (e.altKey && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        void toggleListen();
        return;
      }
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpenMode(true, true);
        setTab("kept");
        window.setTimeout(() => searchRef.current?.focus(), 10);
        return;
      }
      if (meta && e.ctrlKey && /^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const idx = e.key === "0" ? 9 : Number(e.key) - 1;
        const clip = state.clips[idx];
        if (clip) {
          void navigator.clipboard.writeText(clip.kind === "image" ? clip.meta.ocr || clip.preview : clip.meta.transcript ?? clip.content);
          showToast(`Pasted ${clip.kind}`);
        }
        return;
      }
      if (!open) return;
      if (e.key === "Escape") {
        setOpenMode(false, true);
        return;
      }
      if (!meta && "1234".includes(e.key) && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        const next = TABS[Number(e.key) - 1];
        if (next) setTab(next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpenMode, showToast, state.clips, toggleListen]);

  const mood: Mood = recorder.recording
    ? "listen"
    : state.focus.running
      ? "focus"
      : state.lastBlockedAt && now - state.lastBlockedAt < 5000
        ? "secret"
        : state.clips[0] && now - state.clips[0].createdAt < 8000
          ? "copy"
          : "idle";

  const view = useIsland({
    now,
    recording: recorder.recording,
    elapsedMs: recorder.elapsedMs,
    partial: recorder.partial,
  });

  useEffect(() => {
    const onSheet = () => {
      pinnedRef.current = true;
      setPinned(true);
      setOpenMode(true, true);
      setSheet(true);
    };
    const onOpen = () => {
      pinnedRef.current = true;
      setPinned(true);
      setSheet(false);
      setOpenMode(true, true);
    };
    window.addEventListener("cove-settings", onSheet);
    window.addEventListener("cove-open", onOpen);
    return () => {
      window.removeEventListener("cove-settings", onSheet);
      window.removeEventListener("cove-open", onOpen);
    };
  }, [setOpenMode]);

  const onIslandEnter = () => {
    if (!state.hoverOpen) return;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    hoverTimer.current = window.setTimeout(() => setOpenMode(true, false), 70);
  };
  const onIslandLeave = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
  };

  return (
    <div className={`studio ${isNativeApp() ? "is-native" : ""}`}>
      <div className={`mac ${isNativeApp() ? "is-native" : ""}`} data-open={open}>
        {isNativeApp() ? null : (
          <>
            <div className="wallpaper" />
            <header className="menubar">
              <span>
                <b>Alt-AK</b> &nbsp; File &nbsp; Edit &nbsp; View
              </span>
              <span>
                {formatDay()} &nbsp; {clock}
              </span>
            </header>
            <div className="desktop">
              <div className="stickers">
                {STICKERS.map((s) => (
                  <button
                    key={s.label}
                    className={`sticker ${s.mono ? "mono" : ""}`}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(s.value);
                      } catch {
                        /* demo still keeps it */
                      }
                      keep(s.value, { source: "Desk", kind: s.kind, meta: s.meta });
                    }}
                  >
                    <span className="k">{s.label}</span>
                    {s.kind === "color" ? <span className="swatch" style={{ background: s.value }} /> : null}
                    <span className="v">{s.show ?? s.value}</span>
                  </button>
                ))}
              </div>
              <p className="hint">
                Roux lives in the notch. Copy, paste a screenshot, or press <kbd>⌥L</kbd> and talk.
                Hover the island, or <kbd>⌥N</kbd>. Search with <kbd>⌘K</kbd>. Skip-paste with{" "}
                <kbd>⌘⌃1</kbd>–<kbd>0</kbd>.
              </p>
            </div>
          </>
        )}

        <aside className="buddy">
          <Roux
            mood={mood}
            size={108}
            cueColor={mood === "copy" && state.clips[0]?.kind === "color" ? state.clips[0].content : undefined}
          />
          {recorder.recording || state.focus.running || mood === "copy" || mood === "secret" ? (
            <div className="buddy-card">
              {recorder.recording ? (
                <>
                  <span className="buddy-k">Listening</span>
                  <Waveform peaks={Array.from({ length: 18 }, () => 0.25)} live={recorder.level} />
                  <strong>{recorder.partial || "Say it. Roux will keep it."}</strong>
                </>
              ) : mood === "secret" ? (
                <>
                  <span className="buddy-k">Held back</span>
                  <strong>Not saved</strong>
                  <em>Roux didn’t keep that secret.</em>
                </>
              ) : mood === "copy" ? (
                <>
                  <span className="buddy-k">Kept</span>
                  <strong>{state.clips[0]?.kind ?? "clip"}</strong>
                  <em>{state.clips[0]?.preview ?? "Tucked away"}</em>
                </>
              ) : (
                <>
                  <span className="buddy-k">Focus</span>
                  <strong>{formatTime(state.focus.remainingMs)}</strong>
                  <em>{state.tasks.find((t) => t.id === state.focus.taskId)?.title ?? "Deep work"}</em>
                </>
              )}
            </div>
          ) : null}
        </aside>

        {toast ? <div className="toast">{toast}</div> : null}

        <div
          className={`notch-layer ${open ? "is-wide" : ""} ${isNativeApp() ? "is-dock" : ""}`}
          onMouseEnter={() => {
            if (closeTimer.current) window.clearTimeout(closeTimer.current);
          }}
          onMouseLeave={() => {
            onIslandLeave();
            closeTimer.current = window.setTimeout(() => {
              if (Date.now() < suspendClose.current) return;
              if (!pinnedRef.current && !openedByKey.current) setOpenMode(false, false);
            }, 280);
          }}
        >
          {isNativeApp() ? (
            <NotchDock
              open={open}
              mood={mood}
              view={view}
              cueColor={mood === "copy" && state.clips[0]?.kind === "color" ? state.clips[0].content : undefined}
              onToggle={() => {
                if (open) {
                  setOpenMode(false, false);
                  return;
                }
                pinnedRef.current = true;
                setPinned(true);
                setOpenMode(true, false);
              }}
              showRings={state.showRings}
              timer={state.focus.running || state.focus.startedAt ? formatTime(state.focus.remainingMs) : null}
              waterDue={waterIsDue(state.water, now)}
              listening={recorder.recording}
              onMic={() => void toggleListen()}
              onHover={onIslandEnter}
            >
              {sheet ? (
                <div className="settings-inline">
                  <button type="button" className="btn ghost" onClick={() => setSheet(false)}>
                    Back
                  </button>
                  <SettingsWindow
                    updateVersion={updateVersion}
                    updating={updating}
                    onUpdate={runUpdate}
                    onChecked={setUpdateVersion}
                  />
                </div>
              ) : (
              <CovePanel
                open={open}
                instant={instant}
                query={query}
                tab={tab}
                searchRef={searchRef}
                recorder={recorder}
                onQuery={setQuery}
                onTab={setTab}
                onListen={() => void toggleListen()}
                onCopy={(c) => {
                  void navigator.clipboard.writeText(c);
                  showToast("Copied");
                }}
                onCancel={() => void recorder.cancel()}
                onClose={(e) => {
                  if (e.altKey) {
                    void quitCove();
                    return;
                  }
                  setOpenMode(false, false);
                }}
                intro={intro}
                onIntro={finishIntro}
                updateVersion={updateVersion}
                updating={updating}
                onUpdate={runUpdate}
              />
              )}
            </NotchDock>
          ) : (
            <>
            <button
              className={`island ${view.hot || open ? "hot" : ""}`}
              onMouseEnter={onIslandEnter}
              onClick={() => {
                if (open && pinned) {
                  setOpenMode(false, false);
                  return;
                }
                pinnedRef.current = true;
                setPinned(true);
                setOpenMode(true, false);
              }}
              aria-expanded={open}
              aria-label="Open Alt-AK"
            >
              {state.focus.running || recorder.recording ? <span className="pulse" /> : null}
              <Roux
                mood={mood}
                size={32}
                compact
                cueColor={mood === "copy" && state.clips[0]?.kind === "color" ? state.clips[0].content : undefined}
              />
              <span className="mark">alt-ak</span>
              {view.persistent ? (
                <span className="live">{view.persistent.label}</span>
              ) : view.transient ? (
                <span className="live">{view.transient.label}</span>
              ) : null}
              {view.persistent?.detail ? (
                <span className="live-task">{view.persistent.detail}</span>
              ) : view.transient?.detail ? (
                <span className="live-task">{view.transient.detail}</span>
              ) : null}
            </button>
            <CovePanel
              open={open}
              instant={instant}
              query={query}
              tab={tab}
              searchRef={searchRef}
              recorder={recorder}
              onQuery={setQuery}
              onTab={setTab}
              onListen={() => void toggleListen()}
              onCopy={(c) => {
                void navigator.clipboard.writeText(c);
                showToast("Copied");
              }}
              onCancel={() => void recorder.cancel()}
              onClose={(e) => {
                if (e.altKey) {
                  void quitCove();
                  return;
                }
                setOpenMode(false, false);
              }}
              intro={intro}
              onIntro={finishIntro}
              updateVersion={updateVersion}
              updating={updating}
              onUpdate={runUpdate}
            />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CovePanel({
  open,
  instant,
  query,
  tab,
  searchRef,
  recorder,
  onQuery,
  onTab,
  onListen,
  onCopy,
  onCancel,
  onClose,
  intro,
  onIntro,
  updateVersion,
  updating,
  onUpdate,
}: {
  open: boolean;
  instant: boolean;
  query: string;
  tab: Tab;
  searchRef: RefObject<HTMLInputElement | null>;
  recorder: ReturnType<typeof useRecorder>;
  onQuery: (q: string) => void;
  onTab: (t: Tab) => void;
  onListen: () => void;
  onCopy: (content: string) => void;
  onCancel: () => void;
  onClose: (e: MouseEvent) => void;
  intro: boolean;
  onIntro: () => void;
  updateVersion: string | null;
  updating: boolean;
  onUpdate: () => void;
}) {
  return (
    <div className="panel" data-open={open} data-instant={instant} aria-hidden={!open}>
      {intro && open ? <IntroLayer onDone={onIntro} /> : null}
      <div className="panel-head">
        <label className="search">
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search clips, tasks, notes, voice"
          />
        </label>
        <button
          className={`mic-btn voice-note ${recorder.recording ? "is-on" : ""}`}
          onClick={() => {
            if (!recorder.recording) onListen();
          }}
          aria-pressed={recorder.recording}
          title="Voice note"
        >
          Voice note
        </button>
        {recorder.recording ? (
          <button className="mic-btn voice-end" type="button" onClick={onListen} title="End recording">
            End
          </button>
        ) : null}
        {updateVersion ? (
          <button type="button" className="mic-btn update-pill" onClick={onUpdate} disabled={updating}>
            {updating ? "Updating" : `Update ${updateVersion}`}
          </button>
        ) : null}
        <button className="mic-btn" title="Close panel · ⌥-click to quit" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "tab is-on" : "tab"}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {tab === "today" && <TodayView query={query} onOpen={onTab} onCopy={onCopy} />}
        {tab === "kept" && <ClipboardView query={query} onCopy={onCopy} />}
        {tab === "tasks" && <TasksView query={query} />}
        {tab === "notes" && (
          <NotesView
            recording={recorder.recording}
            partial={recorder.partial}
            level={recorder.level}
            peaks={recorder.peaks}
            elapsedMs={recorder.elapsedMs}
            error={recorder.error}
            speechAvailable={recorder.speechAvailable}
            onListen={onListen}
            onCancel={onCancel}
          />
        )}
      </div>
    </div>
  );
}

const STICKERS: {
  label: string;
  value: string;
  kind?: ClipKind;
  mono?: boolean;
  show?: string;
  meta?: { colorName?: string; ocr?: string };
}[] = [
  { label: "Figma iris", value: "#6C6CF8", kind: "color" },
  { label: "Token", value: "--iris: #6C6CF8", mono: true },
  { label: "Timecode", value: "01:12:08:12", mono: true },
  { label: "Footage", value: "/Volumes/Media/A-roll-take-03.mov", mono: true, show: "A-roll-take-03.mov" },
  {
    label: "Looks like a key",
    value: 'ANTHROPIC_API_KEY="sk-ant-api03-DUMMY-KEY-DO-NOT-USE-a1b2c3d4e5f6g7h8i9j0"',
    mono: true,
    show: "ANTHROPIC_API_KEY=sk-ant-…",
  },
  {
    label: "Snippet",
    value: "const keep = (text) => classify(text) && store.prepend(clip)",
    kind: "code",
    mono: true,
  },
  { label: "Mail", value: "gowtham@altcarbon.com" },
  {
    label: "Error from a screenshot",
    value: "TypeError: Cannot read properties of undefined (reading 'clips')",
    meta: { ocr: "TypeError: Cannot read properties of undefined (reading 'clips')" },
  },
];
