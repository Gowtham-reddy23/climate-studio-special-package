import type { AppState, Clip } from "./types";

const now = Date.now();

const ALT_MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 305 305"><g fill="#3919A2"><path d="M58.3 0H43.4v43.4H0v14.8h43.4v43.4h14.9V58.2h43.4V43.4H58.3V0z"/><path d="M159.9 0h-14.8v101.7h14.8V0z"/><path d="M101.7 145.1H0v14.8h101.7v-14.8z"/><path d="M305 145.1h-101.7v14.8H305v-14.8z"/><path d="M261.6 43.4V0h-14.8v43.4h-43.4v14.8h43.4v43.4h14.8V58.2H305V43.4h-43.4z"/><path d="M58.3 203.3H43.4v43.4H0v14.9h43.4V305h14.9v-43.4h43.4v-14.9H58.3v-43.4z"/><path d="M159.9 203.3h-14.8V305h14.8V203.3z"/><path d="M261.6 203.3h-14.8v43.4h-43.4v14.9h43.4V305h14.8v-43.4H305v-14.9h-43.4v-43.4z"/></g></svg>`;

function orgClip(partial: Omit<Clip, "id" | "createdAt" | "pinned" | "board" | "source"> & { id: string }): Clip {
  return {
    createdAt: now,
    pinned: true,
    board: "Design",
    source: "Alt Carbon",
    ...partial,
  };
}

export function orgPins(): Clip[] {
  const links: [string, string, string, string][] = [
    ["org_home", "https://altcarbon.com", "altcarbon.com", "Alt Carbon"],
    ["org_eli5", "https://altcarbon.com/eli5", "altcarbon.com/eli5", "ELI5"],
    ["org_alter", "https://altermag.com", "altermag.com", "Alter"],
    ["org_notion", "https://altcarbon.notion.site/intro", "altcarbon.notion.site", "Intro"],
  ];
  const colors: [string, string, string][] = [
    ["org_iris", "#704BD7", "Monsoon Iris"],
    ["org_deep", "#3919A2", "Iris Deep"],
    ["org_forest", "#0E4325", "Forest"],
    ["org_indigo", "#171C60", "Indigo"],
    ["org_field", "#A6D147", "Field"],
    ["org_rain", "#B7E9F9", "Rain"],
  ];
  return [
    ...links.map(([id, content, domain, preview]) =>
      orgClip({ id, kind: "link", content, preview, meta: { domain: preview || domain } }),
    ),
    orgClip({ id: "org_mark", kind: "svg", content: ALT_MARK, preview: "Alt mark", meta: { language: "SVG" } }),
    ...colors.map(([id, content, colorName]) =>
      orgClip({ id, kind: "color", content, preview: content, meta: { colorName } }),
    ),
  ];
}

export const FOCUS_COPY = "Do not be a Chinmay, win your focus time";

export const NOTEPAD_COPY = [
  "- Don't context switch like Sparsh, close 1 thing today",
  "- Speak to Shrey on 3-month reviews",
  "- Ask Dr. Sourav if laser ablations can save the world",
].join("\n");

export function isDemoNote(text: string) {
  return text.startsWith("Ship Perch as one notch") || text.startsWith("Ship the notch as one notch");
}

export const TODAY_TASKS = [
  "Find Minerals — AK promised diamonds",
  "Don't be a Siddhi, free Wed plans",
];

export const seed: AppState = {
  boards: ["Design", "Edit", "Code", "Life"],
  folders: [],
  notes: [],
  moodBoards: [],
  books: [],
  vault: [],
  blockedSecrets: 0,
  lastBlockedAt: null,
  layout: "horizontal",
  skin: "mat",
  hoverOpen: true,
  showRings: true,
  showTimer: true,
  notesByDay: {
    [new Date().toISOString().slice(0, 10)]: NOTEPAD_COPY,
  },
  events: [],
  google: { connected: false, configured: false, email: "", error: "" },
  tasks: [
    { id: "minerals", title: TODAY_TASKS[0], done: false, createdAt: now - 3600_000, when: "today" },
    { id: "wed", title: TODAY_TASKS[1], done: false, createdAt: now - 7200_000, when: "today" },
  ],
  focusLog: [
    { id: "f1", mode: "pomodoro", startedAt: now - 86400000 * 1 - 3600_000, durationMs: 25 * 60 * 1000, taskId: "t3" },
    { id: "f2", mode: "deep", startedAt: now - 7200_000, durationMs: 48 * 60 * 1000, taskId: "t1" },
    { id: "f3", mode: "pomodoro", startedAt: now - 3600_000, durationMs: 12 * 60 * 1000, taskId: "t2" },
  ],
  focus: {
    running: false,
    mode: "pomodoro",
    remainingMs: 25 * 60 * 1000,
    durationMs: 25 * 60 * 1000,
    taskId: null,
    startedAt: null,
  },
  water: {
    goal: 8,
    count: 0,
    day: new Date().toISOString().slice(0, 10),
    intervalMin: 60,
    lastAt: null,
  },
  clips: orgPins(),
};

