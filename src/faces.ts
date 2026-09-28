import { hexToRgb, parseColor } from "./lib";
import type { Clip } from "./types";

export interface Face {
  id: string;
  label: string;
  value: string;
}

function rgbString(rgb: [number, number, number]) {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function hslString(rgb: [number, number, number]) {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `hsl(0, 0%, ${Math.round(l * 100)}%)`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return `hsl(${Math.round(h * 60)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

export function pasteFaces(clip: Clip): Face[] {
  const faces: Face[] = [{ id: "raw", label: "Paste", value: clip.meta.transcript ?? clip.content }];

  if (clip.kind === "color") {
    const parsed = parseColor(clip.content);
    const rgb = parsed?.startsWith("#") ? hexToRgb(parsed) : null;
    if (parsed) faces.push({ id: "hex", label: "Hex", value: parsed });
    if (rgb) {
      faces.push({ id: "rgb", label: "RGB", value: rgbString(rgb) });
      faces.push({ id: "hsl", label: "HSL", value: hslString(rgb) });
      const token = (clip.meta.colorName ?? "color").toLowerCase().replace(/\s+/g, "-");
      faces.push({ id: "css", label: "CSS", value: `--${token}: ${parsed};` });
      faces.push({ id: "swift", label: "Swift", value: `Color(red: ${(rgb[0] / 255).toFixed(3)}, green: ${(rgb[1] / 255).toFixed(3)}, blue: ${(rgb[2] / 255).toFixed(3)})` });
    }
  }

  if (clip.kind === "code") {
    const lang = (clip.meta.language ?? "").toLowerCase();
    faces.push({ id: "fence", label: "Fence", value: `\`\`\`${lang}\n${clip.content}\n\`\`\`` });
    faces.push({ id: "line", label: "One line", value: clip.content.replace(/\s+/g, " ").trim() });
  }

  if (clip.kind === "link") {
    faces.push({ id: "md", label: "Markdown", value: `[${clip.meta.domain ?? clip.preview}](${clip.content})` });
  }

  if (clip.kind === "audio" && clip.meta.transcript) {
    faces.push({ id: "caption", label: "Caption", value: clip.meta.transcript });
    const dur = Math.max(1, Math.round((clip.meta.durationMs ?? 1000) / 1000));
    faces.push({
      id: "srt",
      label: "SRT",
      value: `1\n00:00:00,000 --> 00:00:${String(dur).padStart(2, "0")},000\n${clip.meta.transcript}`,
    });
  }

  if (clip.kind === "svg") {
    faces.push({ id: "svg", label: "SVG", value: clip.content });
  }

  if (clip.kind === "token") {
    const name = clip.meta.tokenName ?? clip.content.split(":")[0];
    const value = clip.content.split(":").slice(1).join(":").trim().replace(/;$/, "");
    faces.push({ id: "name", label: "Name", value: name });
    faces.push({ id: "value", label: "Value", value: value });
  }

  if (clip.kind === "timecode") {
    if (clip.meta.seconds != null) {
      faces.push({ id: "sec", label: "Seconds", value: String(Math.round(clip.meta.seconds)) });
      faces.push({ id: "yt", label: "YouTube", value: `t=${Math.round(clip.meta.seconds)}s` });
    }
  }

  if (clip.kind === "path") {
    faces.push({ id: "file", label: "Name", value: clip.meta.pathName ?? clip.content.split("/").pop() ?? clip.content });
    faces.push({ id: "url", label: "file://", value: `file://${clip.content}` });
  }

  if (clip.kind === "image" && clip.meta.ocr) {
    faces.push({ id: "ocr", label: "OCR", value: clip.meta.ocr });
  }

  const seen = new Set<string>();
  return faces.filter((f) => {
    if (seen.has(f.value)) return false;
    seen.add(f.value);
    return true;
  });
}
