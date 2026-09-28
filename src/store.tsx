import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { seed } from "./seed";
import type { Action, AppState, Clip, FocusState } from "./types";
import { uid } from "./lib";
import { persist } from "./storage";

const KEY = "cove.v3";

const DURATIONS: Record<FocusState["mode"], number> = {
  pomodoro: 25 * 60 * 1000,
  deep: 50 * 60 * 1000,
  watch: 0,
};

function reduce(state: AppState, action: Action): AppState {
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
    case "add-task": {
      const title = action.title.trim();
      if (!title) return state;
      const task = {
        id: uid("task"),
        title,
        done: false,
        createdAt: Date.now(),
        fromClipId: action.fromClipId,
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
    case "remove-task":
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.id) };
    case "set-note":
      return { ...state, notesByDay: { ...state.notesByDay, [action.day]: action.text } };
    case "append-note": {
      const prev = state.notesByDay[action.day] ?? "";
      const next = prev ? `${prev}\n${action.text}` : action.text;
      return { ...state, notesByDay: { ...state.notesByDay, [action.day]: next } };
    }
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
    case "focus-start": {
      const duration = DURATIONS[action.mode];
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
    case "focus-add":
      return {
        ...state,
        focus: {
          ...state.focus,
          remainingMs: state.focus.remainingMs + action.minutes * 60 * 1000,
          durationMs: state.focus.durationMs + action.minutes * 60 * 1000,
        },
      };
    case "focus-tick":
      return { ...state, focus: { ...state.focus, remainingMs: action.remainingMs } };
    case "focus-delta": {
      const next =
        state.focus.mode === "watch"
          ? state.focus.remainingMs + action.ms
          : Math.max(0, state.focus.remainingMs - action.ms);
      return { ...state, focus: { ...state.focus, remainingMs: next } };
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
    case "secret-blocked":
      return { ...state, blockedSecrets: state.blockedSecrets + 1, lastBlockedAt: Date.now() };
    case "set-layout":
      return { ...state, layout: action.layout };
    case "set-skin":
      return { ...state, skin: action.skin };
    default:
      return state;
  }
}

const StoreContext = createContext<{ state: AppState; dispatch: Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, seed);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AppState;
      if (parsed?.clips && parsed?.tasks)
        dispatch({
          type: "hydrate",
          state: {
            ...seed,
            ...parsed,
            boards: ["Design", "Edit", "Code", "Life"],
            layout: parsed.layout === "vertical" ? "vertical" : "horizontal",
            skin: (["glass", "dark", "light", "mat"] as const).includes(parsed.skin as never)
              ? (parsed.skin as AppState["skin"])
              : "dark",
            focusLog: Array.isArray(parsed.focusLog) ? parsed.focusLog : seed.focusLog,
          },
        });
    } catch {
      /* keep seed */
    }
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
