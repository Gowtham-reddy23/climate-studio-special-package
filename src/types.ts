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

export interface Folder {
  id: string;
  name: string;
  board: string;
}

export interface Clip {
  id: string;
  kind: ClipKind;
  content: string;
  preview: string;
  createdAt: number;
  pinned: boolean;
  board: string | null;
  folder?: string | null;
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

export type TaskWhen = "today" | "next" | "later";

export interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
  doneAt?: number | null;
  fromClipId?: string;
  when?: TaskWhen;
  detail?: string;
  remindAt?: number | null;
  limitMin?: number | null;
  snoozeUntil?: number | null;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  kind: "write" | "list";
  via?: "voice";
  audioId?: string;
  durationMs?: number;
  peaks?: number[];
  pinned: boolean;
  updatedAt: number;
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

export interface GoogleLink {
  connected: boolean;
  configured: boolean;
  email: string;
  error: string;
}

export interface FocusState {
  running: boolean;
  mode: "pomodoro" | "deep" | "watch";
  remainingMs: number;
  durationMs: number;
  taskId: string | null;
  startedAt: number | null;
}

export interface MoodBoard {
  id: string;
  title: string;
  shots: string[];
  updatedAt: number;
}

export type BookStatus = "want" | "reading" | "read";

export interface Book {
  id: string;
  title: string;
  author: string;
  status: BookStatus;
}

export interface VaultItem {
  id: string;
  label: string;
  value: string;
  updatedAt: number;
}

export interface WaterState {
  goal: number;
  count: number;
  day: string;
  intervalMin: number;
  lastAt: number | null;
}

export interface AppState {
  clips: Clip[];
  tasks: Task[];
  events: CalendarEvent[];
  google: GoogleLink;
  notesByDay: Record<string, string>;
  notes: Note[];
  moodBoards: MoodBoard[];
  books: Book[];
  vault: VaultItem[];
  boards: string[];
  folders: Folder[];
  focus: FocusState;
  focusLog: FocusLog[];
  water: WaterState;
  blockedSecrets: number;
  lastBlockedAt: number | null;
  layout: DockLayout;
  skin: Skin;
  hoverOpen: boolean;
  showRings: boolean;
  showTimer: boolean;
}

export type Action =
  | { type: "hydrate"; state: AppState }
  | { type: "add-clip"; clip: Clip }
  | { type: "remove-clip"; id: string }
  | { type: "toggle-pin"; id: string }
  | { type: "set-board"; id: string; board: string | null }
  | { type: "add-board"; name: string }
  | { type: "add-folder"; name: string; board: string }
  | { type: "remove-folder"; id: string }
  | { type: "set-folder"; id: string; folder: string | null }
  | { type: "add-task"; title: string; fromClipId?: string; when?: TaskWhen; remindAt?: number }
  | { type: "toggle-task"; id: string }
  | { type: "set-task"; id: string; title?: string; when?: TaskWhen; detail?: string; remindAt?: number | null; limitMin?: number | null; snoozeUntil?: number | null }
  | { type: "duplicate-task"; id: string }
  | { type: "remove-task"; id: string }
  | { type: "clear-done" }
  | { type: "set-note"; day: string; text: string }
  | { type: "append-note"; day: string; text: string }
  | {
      type: "add-note";
      title: string;
      kind: Note["kind"];
      body?: string;
      via?: "voice";
      audioId?: string;
      durationMs?: number;
      peaks?: number[];
    }
  | { type: "update-note"; id: string; title?: string; body?: string; pinned?: boolean }
  | { type: "remove-note"; id: string }
  | { type: "toggle-note-line"; id: string; index: number }
  | { type: "set-transcript"; id: string; transcript: string }
  | { type: "set-ocr"; id: string; ocr: string }
  | { type: "focus-start"; mode: FocusState["mode"]; taskId: string | null; durationMs?: number }
  | { type: "focus-set"; durationMs: number }
  | { type: "focus-pause" }
  | { type: "focus-resume" }
  | { type: "focus-add"; minutes: number }
  | { type: "focus-tick"; remainingMs: number }
  | { type: "focus-delta"; ms: number }
  | { type: "focus-stop" }
  | { type: "water-drink" }
  | { type: "water-set"; count: number }
  | { type: "add-mood"; title: string }
  | { type: "remove-mood"; id: string }
  | { type: "add-shot"; id: string; clipId: string }
  | { type: "remove-shot"; id: string; clipId: string }
  | { type: "add-book"; title: string; author: string }
  | { type: "set-book"; id: string; status?: Book["status"]; title?: string; author?: string }
  | { type: "remove-book"; id: string }
  | { type: "add-vault"; label: string; value: string }
  | { type: "remove-vault"; id: string }
  | { type: "secret-blocked" }
  | { type: "set-layout"; layout: DockLayout }
  | { type: "set-skin"; skin: Skin }
  | { type: "set-events"; events: CalendarEvent[] }
  | { type: "set-google"; google: GoogleLink }
  | { type: "set-pref"; key: "hoverOpen" | "showRings" | "showTimer"; value: boolean };
