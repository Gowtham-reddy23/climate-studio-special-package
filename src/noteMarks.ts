export type NoteMark = "bold" | "italic" | "strike" | "heading" | "quote" | "bullet" | "number" | "check";

export function applyNoteMark(
  text: string,
  start: number,
  end: number,
  mark: NoteMark,
): { text: string; start: number; end: number } {
  if (mark === "bold" || mark === "italic" || mark === "strike") return wrapSelection(text, start, end, mark);
  return prefixLines(text, start, end, mark);
}

function wrapSelection(text: string, start: number, end: number, mark: "bold" | "italic" | "strike") {
  const token = mark === "bold" ? "**" : mark === "strike" ? "~~" : "*";
  const selected = text.slice(start, end);
  const inner = selected || "text";
  const wrapped = `${token}${inner}${token}`;
  const from = start + token.length;
  return {
    text: text.slice(0, start) + wrapped + text.slice(end),
    start: from,
    end: from + inner.length,
  };
}

function prefixLines(text: string, start: number, end: number, mark: NoteMark) {
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
  const rest = line.slice(indent.length).replace(/^(?:#{1,3}\s|>\s|[-*]\s|\d+\.\s|-\s\[[ x]\]\s)/, "");
  if (mark === "heading") return `${indent}# ${rest}`;
  if (mark === "quote") return `${indent}> ${rest}`;
  const prefix = mark === "number" ? `${index + 1}. ` : mark === "check" ? "- [ ] " : "- ";
  return `${indent}${prefix}${rest}`;
}
