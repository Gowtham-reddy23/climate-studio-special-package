import type { AppState, Clip } from "./types";
import { uid } from "./lib";

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
  clips: [
    ...orgPins(),
    {
      id: uid("clip"),
      kind: "color",
      content: "#6C6CF8",
      preview: "#6C6CF8",
      createdAt: now - 40_000,
      pinned: false,
      board: "Design",
      source: "Figma",
      meta: { colorName: "Iris" },
    },
    {
      id: uid("clip"),
      kind: "token",
      content: "--iris: #6C6CF8",
      preview: "--iris: #6C6CF8",
      createdAt: now - 55_000,
      pinned: false,
      board: "Design",
      source: "Figma",
      meta: { tokenName: "--iris", colorName: "Iris" },
    },
    {
      id: uid("clip"),
      kind: "svg",
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#6C6CF8"/><circle cx="32" cy="32" r="14" fill="#C9A870"/></svg>`,
      preview: "SVG",
      createdAt: now - 80_000,
      pinned: false,
      board: "Design",
      source: "Figma",
      meta: { language: "SVG", width: 64, height: 64 },
    },
    {
      id: uid("clip"),
      kind: "audio",
      content: "Ship the notch as one notch, not two apps.",
      preview: "Ship the notch as one notch, not two apps.",
      createdAt: now - 20_000,
      pinned: false,
      board: "Edit",
      source: "Roux",
      meta: {
        durationMs: 7400,
        transcript: "Ship the notch as one notch, not two apps.",
        peaks: [0.12, 0.4, 0.7, 0.55, 0.3, 0.62, 0.8, 0.45, 0.2, 0.5, 0.66, 0.3, 0.18, 0.42, 0.7, 0.38],
      },
    },
    {
      id: uid("clip"),
      kind: "timecode",
      content: "01:12:08:12",
      preview: "01:12:08:12",
      createdAt: now - 200_000,
      pinned: false,
      board: "Edit",
      source: "Premiere",
      meta: { seconds: 4328 },
    },
    {
      id: uid("clip"),
      kind: "path",
      content: "/Volumes/Media/A-roll-take-03.mov",
      preview: "A-roll-take-03.mov",
      createdAt: now - 260_000,
      pinned: false,
      board: "Edit",
      source: "Finder",
      meta: { pathName: "A-roll-take-03.mov", fileName: "A-roll-take-03.mov" },
    },
    {
      id: uid("clip"),
      kind: "code",
      content: `func capturePasteboard(_ changeCount: Int) {\n    guard changeCount != lastCount else { return }\n    lastCount = changeCount\n    classify(NSPasteboard.general)\n}`,
      preview: "func capturePasteboard(_ changeCount: Int)",
      createdAt: now - 480_000,
      pinned: false,
      board: "Code",
      source: "Xcode",
      meta: { language: "Swift" },
    },
    {
      id: uid("clip"),
      kind: "link",
      content: "https://www.figma.com/design/perch/island",
      preview: "figma.com/design/perch/island",
      createdAt: now - 120_000,
      pinned: false,
      board: "Design",
      source: "Safari",
      meta: { domain: "figma.com" },
    },
    {
      id: uid("clip"),
      kind: "text",
      content: "gowtham@altcarbon.com",
      preview: "gowtham@altcarbon.com",
      createdAt: now - 900_000,
      pinned: false,
      board: "Life",
      source: "Mail",
      meta: {},
    },
    {
      id: uid("clip"),
      kind: "image",
      content: "linear-gradient(135deg,#2a2438,#6a4a38 42%,#c9a870)",
      preview: "Screenshot",
      createdAt: now - 1800_000,
      pinned: false,
      board: "Life",
      source: "Screenshot",
      meta: {
        ocr: "Alt-AK  24:12  Brand review\nKeep this in the island while you work.",
        width: 1440,
        height: 900,
      },
    },
    {
      id: uid("clip"),
      kind: "link",
      content: "https://www.notchowl.com/",
      preview: "www.notchowl.com/",
      createdAt: now - 3600_000,
      pinned: false,
      board: "Life",
      source: "Safari",
      meta: { domain: "notchowl.com" },
    },
    {
      id: uid("clip"),
      kind: "color",
      content: "#C9A870",
      preview: "#C9A870",
      createdAt: now - 5400_000,
      pinned: false,
      board: "Design",
      source: "Figma",
      meta: { colorName: "Brass" },
    },
  ],
};

