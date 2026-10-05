import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { isDemoNote, NOTEPAD_COPY, orgPins, PREVIOUS_NOTEPAD_COPY, seed, TODAY_TASKS, withoutDroppedNotes } from "./seed";
import type { Action, AppState, Book, Clip, FocusState, MoodBoard, Note, Task, VaultItem } from "./types";
import { todayKey, uid } from "./lib";
import { persist } from "./storage";

const KEY = "cove.v3";

const DURATIONS: Record<FocusState["mode"], number> = {
  pomodoro: 25 * 60 * 1000,
  deep: 50 * 60 * 1000,
  watch: 0,
};

export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate":
      return action.state;
    case "add-clip": {
      const exists = state.clips.find(
        (c) => c.content === action.clip.content && c.kind === action.clip.kind,
      );
      if (exists) {
        return {
          ...state,
          clips: [{ ...exists, createdAt: action.clip.createdAt }, ...state.clips.filter((c) => c.id !== exists.id)],
        };
      }
      return { ...state, clips: [action.clip, ...state.clips].slice(0, 200) };
    }
    case "remove-clip":
      return { ...state, clips: state.clips.filter((c) => c.id !== action.id) };
    case "toggle-pin":
      return {
        ...state,
        clips: state.clips.map((c) => (c.id === action.id ? { ...c, pinned: !c.pinned } : c)),
      };
    case "set-board":
      return {
        ...state,
        clips: state.clips.map((c) => (c.id === action.id ? { ...c, board: action.board } : c)),
      };
    case "add-board":
      if (!action.name.trim() || state.boards.includes(action.name.trim())) return state;
      return { ...state, boards: [...state.boards, action.name.trim()] };
    case "add-folder": {
      const name = action.name.trim().slice(0, 28);
      const board = action.board.trim();
      if (!name || !board) return state;
      if (state.folders.some((f) => f.board === board && f.name.toLowerCase() === name.toLowerCase())) return state;
      return { ...state, folders: [...state.folders, { id: uid("folder"), name, board }] };
    }
    case "remove-folder":
      return {
        ...state,
        folders: state.folders.filter((f) => f.id !== action.id),
        clips: state.clips.map((c) => (c.folder === action.id ? { ...c, folder: null } : c)),
      };
    case "set-folder": {
      const folder = state.folders.find((f) => f.id === action.folder);
      return {
        ...state,
        clips: state.clips.map((c) =>
          c.id === action.id ? { ...c, folder: action.folder, board: folder?.board ?? c.board } : c,
        ),
      };
    }
    case "add-task": {
      const title = action.title.trim();
      if (!title) return state;
      const task = {
        id: uid("task"),
        title,
        done: false,
        createdAt: Date.now(),
        fromClipId: action.fromClipId,
        when: action.when ?? "today",
        detail: "",
        remindAt: action.remindAt ?? null,
      };
      return { ...state, tasks: [task, ...state.tasks] };
    }
    case "toggle-task":
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.id
            ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : null }
            : t,
        ),
      };
    case "set-task":
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.id
            ? {
                ...t,
                title: action.title !== undefined ? action.title.trim() || t.title : t.title,
                when: action.when ?? t.when,
                detail: action.detail !== undefined ? action.detail : t.detail,
                ...("remindAt" in action ? { remindAt: action.remindAt } : {}),
                ...("limitMin" in action ? { limitMin: action.limitMin } : {}),
                ...("snoozeUntil" in action ? { snoozeUntil: action.snoozeUntil } : {}),
              }
            : t,
        ),
      };
    case "duplicate-task": {
      const src = state.tasks.find((t) => t.id === action.id);
      if (!src) return state;
      const copy = {
        ...src,
        id: uid("task"),
        title: src.title,
        done: false,
        doneAt: null,
        createdAt: Date.now(),
        remindAt: null,
        snoozeUntil: null,
      };
      return { ...state, tasks: [copy, ...state.tasks] };
    }
    case "remove-task":
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.id) };
    case "clear-done":
      return { ...state, tasks: state.tasks.filter((t) => !t.done) };
    case "set-note":
      return { ...state, notesByDay: { ...state.notesByDay, [action.day]: action.text } };
    case "append-note": {
      const prev = state.notesByDay[action.day] ?? "";
      const next = prev ? `${prev}\n${action.text}` : action.text;
      return { ...state, notesByDay: { ...state.notesByDay, [action.day]: next } };
    }
    case "add-note": {
      const title = action.title.trim() || (action.kind === "list" ? "List" : "Note");
      const note: Note = {
        id: uid("note"),
        title,
        body: action.body ?? (action.kind === "list" ? "- [ ] " : ""),
        kind: action.kind,
        via: action.via,
        audioId: action.audioId,
        durationMs: action.durationMs,
        peaks: action.peaks,
        pinned: false,
        updatedAt: Date.now(),
      };
      return { ...state, notes: [note, ...(state.notes ?? [])] };
    }
    case "update-note":
      return {
        ...state,
        notes: (state.notes ?? []).map((n) =>
          n.id === action.id
            ? {
                ...n,
                title: action.title !== undefined ? action.title : n.title,
                body: action.body !== undefined ? action.body : n.body,
                pinned: action.pinned !== undefined ? action.pinned : n.pinned,
                updatedAt: Date.now(),
              }
            : n,
        ),
      };
    case "remove-note":
      return { ...state, notes: (state.notes ?? []).filter((n) => n.id !== action.id) };
    case "toggle-note-line":
      return {
        ...state,
        notes: (state.notes ?? []).map((n) => {
          if (n.id !== action.id) return n;
          const lines = n.body.split("\n");
          const line = lines[action.index] ?? "";
          if (line.startsWith("- [x]")) lines[action.index] = line.replace("- [x]", "- [ ]");
          else if (line.startsWith("- [ ]")) lines[action.index] = line.replace("- [ ]", "- [x]");
          else lines[action.index] = `- [ ] ${line}`;
          return { ...n, body: lines.join("\n"), updatedAt: Date.now() };
        }),
      };
    case "set-ocr":
      return {
        ...state,
        clips: state.clips.map((c) =>
          c.id === action.id ? { ...c, meta: { ...c.meta, ocr: action.ocr } } : c,
        ),
      };
    case "set-transcript":
      return {
        ...state,
        clips: state.clips.map((c) =>
          c.id === action.id
            ? { ...c, content: action.transcript, preview: action.transcript, meta: { ...c.meta, transcript: action.transcript } }
            : c,
        ),
      };
    case "edit-clip": {
      const content = action.content.trim();
      if (!content) return state;
      return {
        ...state,
        clips: state.clips.map((c) => {
          if (c.id !== action.id) return c;
          const line = content.split("\n").find((row) => row.trim())?.trim() ?? content;
          const preview = line.length > 80 ? `${line.slice(0, 77)}…` : line;
          const meta = { ...c.meta };
          if (c.kind === "link") {
            try {
              const href = content.includes("://") ? content : `https://${content}`;
              meta.domain = new URL(href).hostname.replace(/^www\./, "");
            } catch {
              /* keep the previous domain */
            }
          }
          if (c.kind === "audio") meta.transcript = content;
          return { ...c, content, preview, meta };
        }),
      };
    }
    case "focus-start": {
      const duration = action.durationMs && action.durationMs > 0 ? action.durationMs : DURATIONS[action.mode];
      return {
        ...state,
        focus: {
          running: true,
          mode: action.mode,
          remainingMs: action.mode === "watch" ? 0 : duration,
          durationMs: duration,
          taskId: action.taskId,
          startedAt: Date.now(),
        },
      };
    }
    case "focus-pause":
      return { ...state, focus: { ...state.focus, running: false } };
    case "focus-resume":
      return { ...state, focus: { ...state.focus, running: true, startedAt: Date.now() } };
    case "focus-set": {
      const duration = Math.max(5 * 60 * 1000, Math.min(180 * 60 * 1000, action.durationMs));
      return {
        ...state,
        focus: {
          ...state.focus,
          mode: state.focus.mode === "watch" ? "pomodoro" : state.focus.mode,
          remainingMs: duration,
          durationMs: duration,
          running: state.focus.running,
          startedAt: state.focus.running ? state.focus.startedAt : null,
        },
      };
    }
    case "focus-add": {
      const remaining = Math.max(60 * 1000, state.focus.remainingMs + action.minutes * 60 * 1000);
      return {
        ...state,
        focus: {
          ...state.focus,
          remainingMs: remaining,
          durationMs: Math.max(remaining, state.focus.durationMs + action.minutes * 60 * 1000),
        },
      };
    }
    case "focus-tick":
      return { ...state, focus: { ...state.focus, remainingMs: action.remainingMs } };
    case "focus-delta": {
      const next =
        state.focus.mode === "watch"
          ? state.focus.remainingMs + action.ms
          : Math.max(0, state.focus.remainingMs - action.ms);
      return { ...state, focus: { ...state.focus, remainingMs: next } };
    }
    case "water-drink": {
      const day = todayKey();
      const water = state.water ?? seed.water;
      const count = water.day === day ? water.count : 0;
      if (count >= water.goal) {
        return { ...state, water: { ...water, day, lastAt: Date.now() } };
      }
      return { ...state, water: { ...water, day, count: count + 1, lastAt: Date.now() } };
    }
    case "water-set": {
      const day = todayKey();
      const water = state.water ?? seed.water;
      const prev = water.day === day ? water.count : 0;
      const count = Math.max(0, Math.min(water.goal, action.count));
      return {
        ...state,
        water: { ...water, day, count, lastAt: count > prev ? Date.now() : water.lastAt },
      };
    }
    case "focus-stop": {
      const elapsed =
        state.focus.mode === "watch"
          ? state.focus.remainingMs
          : Math.max(0, state.focus.durationMs - state.focus.remainingMs);
      const log =
        state.focus.startedAt && elapsed >= 20_000
          ? [
              {
                id: uid("focus"),
                mode: state.focus.mode,
                startedAt: state.focus.startedAt,
                durationMs: elapsed,
                taskId: state.focus.taskId,
              },
              ...state.focusLog,
            ].slice(0, 80)
          : state.focusLog;
      return {
        ...state,
        focusLog: log,
        focus: {
          ...state.focus,
          running: false,
          remainingMs: state.focus.mode === "watch" ? 0 : DURATIONS[state.focus.mode],
          startedAt: null,
        },
      };
    }
    case "add-mood": {
      const title = action.title.trim();
      if (!title) return state;
      const board: MoodBoard = { id: uid("mood"), title, shots: [], updatedAt: Date.now() };
      return { ...state, moodBoards: [board, ...(state.moodBoards ?? [])] };
    }
    case "remove-mood":
      return { ...state, moodBoards: (state.moodBoards ?? []).filter((b) => b.id !== action.id) };
    case "add-shot":
      return {
        ...state,
        moodBoards: (state.moodBoards ?? []).map((b) =>
          b.id === action.id && !b.shots.includes(action.clipId)
            ? { ...b, shots: [...b.shots, action.clipId], updatedAt: Date.now() }
            : b,
        ),
      };
    case "remove-shot":
      return {
        ...state,
        moodBoards: (state.moodBoards ?? []).map((b) =>
          b.id === action.id ? { ...b, shots: b.shots.filter((id) => id !== action.clipId), updatedAt: Date.now() } : b,
        ),
      };
    case "add-book": {
      const title = action.title.trim();
      if (!title) return state;
      const book: Book = { id: uid("book"), title, author: action.author.trim(), status: "want" };
      return { ...state, books: [book, ...(state.books ?? [])] };
    }
    case "set-book":
      return {
        ...state,
        books: (state.books ?? []).map((b) =>
          b.id === action.id
            ? {
                ...b,
                status: action.status ?? b.status,
                title: action.title !== undefined ? action.title : b.title,
                author: action.author !== undefined ? action.author : b.author,
              }
            : b,
        ),
      };
    case "remove-book":
      return { ...state, books: (state.books ?? []).filter((b) => b.id !== action.id) };
    case "add-vault": {
      const label = action.label.trim();
      const value = action.value.trim();
      if (!label || !value) return state;
      const item: VaultItem = { id: uid("vault"), label, value, updatedAt: Date.now() };
      return { ...state, vault: [item, ...(state.vault ?? [])] };
    }
    case "remove-vault":
      return { ...state, vault: (state.vault ?? []).filter((v) => v.id !== action.id) };
    case "secret-blocked":
      return { ...state, blockedSecrets: state.blockedSecrets + 1, lastBlockedAt: Date.now() };
    case "set-layout":
      return { ...state, layout: action.layout };
    case "set-skin":
      return { ...state, skin: action.skin };
    case "set-pref":
      return { ...state, [action.key]: action.value };
    case "set-events":
      return { ...state, events: action.events };
    case "set-google":
      return { ...state, google: action.google };
    default:
      return state;
  }
}

const StoreContext = createContext<{ state: AppState; dispatch: Dispatch<Action> } | null>(null);

function mergeOrgPins(clips: AppState["clips"]) {
  const have = new Set(clips.flatMap((c) => [c.id, c.content]));
  const missing = orgPins().filter((p) => !have.has(p.id) && !have.has(p.content));
  return missing.length ? [...missing, ...clips] : clips;
}

const DEMO_TITLES = new Set([
  "Polish the notch expand so it feels like the island, not a window",
  "Auto-sort colors, links, and code without asking",
  "Block secrets before they ever hit history",
]);

function isDemoTask(task: { title: string }) {
  return DEMO_TITLES.has(task.title);
}

function migrateTasks(tasks: Task[]) {
  const base = tasks.some(isDemoTask)
    ? [...seed.tasks, ...tasks.filter((task) => !isDemoTask(task) && !TODAY_TASKS.includes(task.title))]
    : tasks;
  const missing = seed.tasks.filter(
    (task) => task.id === "mahananda" && !base.some((item) => item.id === task.id || item.title === task.title),
  );
  return missing.length ? [...missing, ...base] : base;
}

function migrateNotes(notesByDay: AppState["notesByDay"] | undefined) {
  const day = new Date().toISOString().slice(0, 10);
  const notes = { ...(notesByDay ?? {}) };
  const current = notes[day] ?? "";
  if (!(day in notes) || isDemoNote(current) || current.trim() === PREVIOUS_NOTEPAD_COPY) notes[day] = NOTEPAD_COPY;
  else if (day in notes) notes[day] = withoutDroppedNotes(current) || NOTEPAD_COPY;
  for (const key of Object.keys(notes)) {
    if (isDemoNote(notes[key] ?? "")) notes[key] = NOTEPAD_COPY;
  }
  return notes;
}

function onlyDefaultPins() {
  return orgPins();
}

function loadInitial(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    const resetHistory = localStorage.getItem("cove.history-reset") !== "1";
    if (!raw) {
      localStorage.setItem("cove.history-reset", "1");
      return seed;
    }
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed?.clips || !parsed?.tasks) return seed;
    const notesByDay = migrateNotes(parsed.notesByDay);
    if (resetHistory) {
      notesByDay[new Date().toISOString().slice(0, 10)] = NOTEPAD_COPY;
      localStorage.setItem("cove.history-reset", "1");
    }
    return {
      ...seed,
      ...parsed,
      boards: ["Design", "Edit", "Code", "Life"],
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      moodBoards: Array.isArray(parsed.moodBoards) ? parsed.moodBoards : [],
      books: Array.isArray(parsed.books) ? parsed.books : [],
      vault: Array.isArray(parsed.vault) ? parsed.vault : [],
      layout: "horizontal",
      skin: "mat",
      hoverOpen: parsed.hoverOpen !== false,
      showRings: parsed.showRings !== false,
      showTimer: parsed.showTimer !== false,
      notesByDay,
      tasks: migrateTasks(Array.isArray(parsed.tasks) ? parsed.tasks : seed.tasks),
      focus: parsed.focus ? { ...seed.focus, ...parsed.focus, taskId: null } : seed.focus,
      focusLog: Array.isArray(parsed.focusLog) ? parsed.focusLog : seed.focusLog,
      water: { ...seed.water, ...(parsed.water ?? {}) },
      events: Array.isArray(parsed.events) ? parsed.events.filter((e) => !["e1", "e2", "e3"].includes(e.id)) : [],
      google: {
        connected: Boolean(parsed.google?.connected),
        configured: Boolean(parsed.google?.configured),
        email: parsed.google?.email ?? "",
        error: parsed.google?.error ?? "",
      },
      clips: resetHistory ? onlyDefaultPins() : mergeOrgPins(parsed.clips),
    };
  } catch {
    return seed;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  // Load synchronously in the initializer so the persist effect never clobbers
  // stored data with the seed before an async hydrate can land.
  const [state, dispatch] = useReducer(reduce, undefined, loadInitial);

  useEffect(() => {
    void import("./blobDb").then(({ pruneBlobs }) => {
      void import("./noteFiles").then(({ noteBlobIds }) => {
        const ids = [
          ...state.clips.map((clip) => clip.id),
          ...Object.values(state.notesByDay ?? {}).flatMap((body) => noteBlobIds(body)),
          ...(state.notes ?? []).flatMap((note) => noteBlobIds(note.body)),
        ];
        return pruneBlobs(ids);
      });
    });
    // Runs once on mount; state.clips is the hydrated set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    persist(KEY, state);
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("Store missing");
  return ctx;
}

export function makeClip(partial: Omit<Clip, "id" | "createdAt"> & { createdAt?: number }): Clip {
  return {
    ...partial,
    id: uid("clip"),
    createdAt: partial.createdAt ?? Date.now(),
  };
}
