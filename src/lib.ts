import type { Clip, ClipKind, WaterState } from "./types";

const SECRET_PATTERNS = [
  /sk-[a-z]{2,10}-[A-Za-z0-9_-]{16,}/i,
  /sk-ant-[A-Za-z0-9_-]{12,}/i,
  /ghp_[A-Za-z0-9]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /\b(api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['\"]?[^\s'\"]{8,}/i,
  /\b(?:\d[ -]*?){13,19}\b/,
];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(/i;
const HSL = /^hsla?\(/i;
const URL_RE = /^(https?:\/\/|www\.)\S+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SVG_RE = /^<svg[\s>]/i;
const TOKEN_RE = /^(--[\w-]+)\s*:\s*(.+)$/;
const TIMECODE_RE = /^(\d{1,2}:){1,2}\d{2}([:;]\d{2})?$/;
const PATH_RE = /^(\/Users\/|\/Volumes\/|~\/|\/tmp\/).+\.\w{2,5}$/;
const VIDEO_EXT = /\.(mov|mp4|mxf|mkv|wav|aif|aiff|r3d|braw)$/i;
const CODE_RE =
  /^(import |from |const |let |var |function |class |def |export |#include |package |fn |interface |type |<\w|{\s*"|\s*\/\/|```)/m;

const COLOR_NAMES: [string, [number, number, number]][] = [
  ["Black", [0, 0, 0]], ["White", [255, 255, 255]], ["Ink", [20, 17, 26]],
  ["Night", [28, 32, 48]], ["Slate", [90, 98, 114]], ["Gray", [128, 128, 128]],
  ["Silver", [192, 192, 192]], ["Paper", [232, 220, 200]], ["Bone", [240, 234, 222]],
  ["Brass", [201, 168, 112]], ["Honey", [232, 176, 88]], ["Gold", [212, 175, 55]],
  ["Copper", [196, 107, 74]], ["Coral", [224, 112, 96]], ["Red", [229, 57, 53]],
  ["Crimson", [178, 34, 52]], ["Blush", [214, 154, 148]], ["Pink", [236, 128, 170]],
  ["Magenta", [214, 51, 132]], ["Violet", [124, 92, 168]], ["Purple", [128, 64, 176]],
  ["Iris", [108, 108, 248]], ["Indigo", [75, 61, 189]], ["Blue", [0, 0, 255]],
  ["Azure", [37, 99, 235]], ["Sky", [96, 165, 250]], ["Tide", [106, 138, 138]],
  ["Teal", [45, 156, 156]], ["Ocean", [64, 112, 152]], ["Sage", [152, 176, 148]],
  ["Moss", [90, 122, 96]], ["Green", [46, 160, 67]], ["Lime", [130, 200, 80]],
  ["Olive", [128, 128, 0]], ["Amber", [240, 180, 41]], ["Orange", [240, 138, 46]],
  ["Brown", [124, 82, 52]], ["Tan", [196, 164, 120]], ["Cream", [248, 240, 220]],
];

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}

export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function waterIsDue(water: WaterState | undefined, now = Date.now()) {
  if (!water || water.goal <= 0) return false;
  const day = todayKey(new Date(now));
  const count = water.day === day ? water.count : 0;
  if (count >= water.goal) return false;
  if (!water.lastAt || water.day !== day) return true;
  return now >= water.lastAt + water.intervalMin * 60_000;
}

export function isSecret(text: string) {
  const trimmed = text.trim();
  return SECRET_PATTERNS.some((re) => re.test(trimmed));
}

export function parseColor(text: string): string | null {
  const t = text.trim();
  if (HEX.test(t) || RGB.test(t) || HSL.test(t)) return t;
  return null;
}

export function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length < 6) return null;
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((((h % 360) + 360) % 360) / 60);
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function parseColorToRgb(value: string): [number, number, number] | null {
  const t = value.trim();
  if (t.startsWith("#")) return hexToRgb(t);
  const rgb = t.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const hsl = t.match(/^hsla?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)%[,\s]+(\d+(?:\.\d+)?)%/i);
  if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]), Number(hsl[3]));
  return null;
}

export function colorName(value: string) {
  const rgb = parseColorToRgb(value);
  if (!rgb) return "Color";
  let best = COLOR_NAMES[0][0];
  let dist = Infinity;
  for (const [name, c] of COLOR_NAMES) {
    const d = (rgb[0] - c[0]) ** 2 + (rgb[1] - c[1]) ** 2 + (rgb[2] - c[2]) ** 2;
    if (d < dist) {
      dist = d;
      best = name;
    }
  }
  return best;
}

export function guessLanguage(content: string) {
  if (content.includes("<svg")) return "SVG";
  if (content.includes("fn ") && content.includes("let ")) return "Rust";
  if (/from ['"]react['"]/.test(content) || content.includes("useState")) return "TSX";
  if (content.trim().startsWith("{") || content.trim().startsWith("[")) return "JSON";
  if (content.includes("def ") || content.includes("import ")) return "Python";
  if (content.includes("func ") || content.includes("package ")) return "Go";
  if (content.includes("<?swift") || content.includes("struct ") || content.includes("SwiftUI"))
    return "Swift";
  return "Code";
}

export function craftFor(kind: ClipKind, content: string, source?: string): import("./types").Craft {
  const src = (source ?? "").toLowerCase();
  if (src.includes("figma") || src.includes("sketch")) return "Design";
  if (src.includes("premiere") || src.includes("final cut") || src.includes("resolve") || src.includes("descript"))
    return "Edit";
  if (src.includes("xcode") || src.includes("vscode") || src.includes("cursor") || src.includes("terminal"))
    return "Code";
  if (kind === "color" || kind === "svg" || kind === "token") return "Design";
  if (kind === "image") return src.includes("screenshot") ? "Life" : "Design";
  if (kind === "timecode" || kind === "path" || kind === "audio") return "Edit";
  if (kind === "code") return "Code";
  if (kind === "link") {
    try {
      const host = new URL(content.startsWith("http") ? content : `https://${content}`).hostname;
      if (host.includes("figma.com")) return "Design";
      if (host.includes("youtube") || host.includes("vimeo") || host.includes("frame.io")) return "Edit";
      if (host.includes("github") || host.includes("localhost")) return "Code";
    } catch {
      /* fall through */
    }
  }
  return "Life";
}

function timecodeSeconds(text: string) {
  const parts = text.split(/[:;]/).map(Number);
  if (parts.some((n) => Number.isNaN(n))) return undefined;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 4) return parts[0] * 3600 + parts[1] * 60 + parts[2] + parts[3] / 30;
  return undefined;
}

export function classify(content: string, extra?: Partial<Clip>): Omit<Clip, "id" | "createdAt"> {
  const text = content.trim();
  const color = parseColor(text);
  let kind: ClipKind = extra?.kind ?? "text";
  const meta: Clip["meta"] = { ...(extra?.meta ?? {}) };

  if (!extra?.kind) {
    if (color) {
      kind = "color";
      meta.colorName = colorName(color);
    } else if (SVG_RE.test(text)) {
      kind = "svg";
      meta.language = "SVG";
    } else if (TOKEN_RE.test(text) && (text.includes("#") || RGB.test(text) || text.includes("px"))) {
      kind = "token";
      const m = text.match(TOKEN_RE);
      meta.tokenName = m?.[1];
      if (m && parseColor(m[2].trim().replace(/;$/, ""))) meta.colorName = colorName(m[2].trim().replace(/;$/, ""));
    } else if (EMAIL_RE.test(text)) {
      kind = "text";
    } else if (URL_RE.test(text)) {
      kind = "link";
      try {
        const url = text.startsWith("http") ? text : `https://${text}`;
        meta.domain = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        meta.domain = text;
      }
    } else if (TIMECODE_RE.test(text) && text.includes(":")) {
      kind = "timecode";
      meta.seconds = timecodeSeconds(text);
    } else if (text.startsWith("file://") || PATH_RE.test(text) || VIDEO_EXT.test(text)) {
      kind = "path";
    } else if (CODE_RE.test(text)) {
      kind = "code";
      meta.language = guessLanguage(text);
    }
  } else if (kind === "color" && !meta.colorName && color) {
    meta.colorName = colorName(color);
  } else if (kind === "code" && !meta.language) {
    meta.language = guessLanguage(text);
  }

  let stored = text;
  if (kind === "path") {
    if (text.startsWith("file://")) {
      try {
        stored = decodeURIComponent(new URL(text).pathname);
      } catch {
        stored = text;
      }
    }
    meta.pathName = meta.pathName ?? stored.split("/").filter(Boolean).pop();
    meta.fileName = meta.fileName ?? meta.pathName;
  }

  const board = extra?.board ?? craftFor(kind, text, extra?.source);

  const preview =
    kind === "color"
      ? text.toUpperCase()
      : kind === "link"
        ? text.replace(/^https?:\/\//, "")
        : kind === "path"
          ? (meta.pathName ?? stored)
          : kind === "svg"
            ? "SVG"
            : text.split("\n")[0].slice(0, 140);

  return {
    kind,
    content: stored,
    preview,
    pinned: false,
    board,
    source: extra?.source ?? "Clipboard",
    meta,
  };
}

export function formatTime(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function formatSpent(ms: number) {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatWhen(ts: number) {
  const d = Date.now() - ts;
  if (d < 45_000) return "just now";
  if (d < 3600_000) return `${Math.floor(d / 60_000)}m`;
  if (d < 86400_000) return `${Math.floor(d / 3600_000)}h`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatClock(date = new Date()) {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatDay(date = new Date()) {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function eventMinutesFromNow(start: string) {
  const [h, m] = start.split(":").map(Number);
  const t = new Date();
  t.setHours(h, m, 0, 0);
  return (t.getTime() - Date.now()) / 60_000;
}
