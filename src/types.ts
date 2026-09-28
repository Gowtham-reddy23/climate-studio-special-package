export type ClipKind =
  | "text"
  | "link"
  | "color"
  | "code"
  | "image"
  | "file"
  | "audio"
  | "svg"
  | "token"
  | "timecode"
  | "path";

export type Craft = "Design" | "Edit" | "Code" | "Life";

export type Tab = "today" | "kept" | "tasks" | "focus" | "notes";

export type DockLayout = "horizontal" | "vertical";

export type Skin = "glass" | "dark" | "light" | "mat";

export type Mood = "idle" | "focus" | "listen" | "copy" | "secret";

export interface Clip {
  id: string;
  kind: ClipKind;
  content: string;
  preview: string;
  createdAt: number;
  pinned: boolean;
  board: string | null;
  source: string;
  meta: {
    colorName?: string;
    domain?: string;
    language?: string;
    ocr?: string;
    fileName?: string;
    width?: number;
    height?: number;
    durationMs?: number;
    peaks?: number[];
    transcript?: string;
    audioId?: string;
    engine?: "live" | "audio-only";
    imageId?: string;
    tokenName?: string;
    seconds?: number;
    pathName?: string;
    evicted?: boolean;
  };
}

export interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
  doneAt?: number | null;
  fromClipId?: string;
}

export interface FocusLog {
  id: string;
  mode: FocusState["mode"];
  startedAt: number;
  durationMs: number;
  taskId: string | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  calendar: string;
}

export interface FocusState {
  running: boolean;
  mode: "pomodoro" | "deep" | "watch";
  remainingMs: number;
  durationMs: number;
  taskId: string | null;
  startedAt: number | null;
}

export interface AppState {
  clips: Clip[];
  tasks: Task[];
  events: CalendarEvent[];
  notesByDay: Record<string, string>;
  boards: string[];
  focus: FocusState;
  focusLog: FocusLog[];
  blockedSecrets: number;
  lastBlockedAt: number | null;
  layout: DockLayout;
  skin: Skin;
}

export type Action =
  | { type: "hydrate"; state: AppState }
  | { type: "add-clip"; clip: Clip }
  | { type: "remove-clip"; id: string }
  | { type: "toggle-pin"; id: string }
  | { type: "set-board"; id: string; board: string | null }
  | { type: "add-board"; name: string }
  | { type: "add-task"; title: string; fromClipId?: string }
  | { type: "toggle-task"; id: string }
  | { type: "remove-task"; id: string }
  | { type: "set-note"; day: string; text: string }
  | { type: "append-note"; day: string; text: string }
  | { type: "set-transcript"; id: string; transcript: string }
  | { type: "set-ocr"; id: string; ocr: string }
  | { type: "focus-start"; mode: FocusState["mode"]; taskId: string | null }
  | { type: "focus-pause" }
  | { type: "focus-resume" }
  | { type: "focus-add"; minutes: number }
  | { type: "focus-tick"; remainingMs: number }
  | { type: "focus-delta"; ms: number }
  | { type: "focus-stop" }
  | { type: "secret-blocked" }
  | { type: "set-layout"; layout: DockLayout }
  | { type: "set-skin"; skin: Skin };
