import { applyNoteMark, type NoteMark } from "./noteMarks";

export type SlashId = NoteMark | "link" | "image" | "pdf";

export const SLASH_COMMANDS: { id: SlashId; label: string; hint: string }[] = [
  { id: "bold", label: "Bold", hint: "Strong words" },
  { id: "italic", label: "Italic", hint: "Slanted words" },
  { id: "heading", label: "Heading", hint: "A title line" },
  { id: "quote", label: "Quote", hint: "Set a line apart" },
  { id: "strike", label: "Strike", hint: "Cross a line out" },
  { id: "bullet", label: "List", hint: "A bullet" },
  { id: "number", label: "Number", hint: "1. 2. 3." },
  { id: "check", label: "Check", hint: "A checkbox" },
  { id: "link", label: "Link", hint: "A web address" },
  { id: "image", label: "Image", hint: "A picture" },
  { id: "pdf", label: "PDF", hint: "A document" },
];

export function slashAt(text: string, cursor: number): { start: number; query: string } | null {
  const lineStart = cursor <= 0 ? 0 : text.lastIndexOf("\n", cursor - 1) + 1;
  const before = text.slice(lineStart, cursor);
  const match = before.match(/(?:^|\s)\/([^\s/]*)$/);
  if (!match) return null;
  const query = match[1] ?? "";
  return { start: cursor - query.length - 1, query };
}

export function filterSlash(query: string) {
  const q = query.toLowerCase();
  return SLASH_COMMANDS.filter((item) => !q || item.label.toLowerCase().includes(q) || item.id.startsWith(q));
}

export function dropSlash(text: string, start: number, cursor: number) {
  return text.slice(0, start) + text.slice(cursor);
}

export function applySlashFormat(text: string, slashStart: number, cursor: number, mark: NoteMark) {
  const cleared = dropSlash(text, slashStart, cursor);
  return applyNoteMark(cleared, slashStart, slashStart, mark);
}
