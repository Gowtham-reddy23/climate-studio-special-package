export type NoteMark = "bullet" | "number" | "check";

export function applyNoteMark(
  text: string,
  start: number,
  end: number,
  mark: NoteMark,
): { text: string; start: number; end: number } {
  const from = start <= 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", Math.max(start, end));
  const to = lineEnd === -1 ? text.length : lineEnd;
  const lines = text.slice(from, to).split("\n");
  const nextLines = lines.map((line, index) => prefixLine(line, mark, index));
  const block = nextLines.join("\n");
  return { text: text.slice(0, from) + block + text.slice(to), start: from, end: from + block.length };
}

function prefixLine(line: string, mark: NoteMark, index: number) {
  const indent = line.match(/^\s*/)?.[0] ?? "";
  const rest = line.slice(indent.length).replace(/^(?:[-*]\s|\d+\.\s|-\s\[[ x]\]\s)/, "");
  const prefix = mark === "number" ? `${index + 1}. ` : mark === "check" ? "- [ ] " : "- ";
  return `${indent}${prefix}${rest}`;
}
