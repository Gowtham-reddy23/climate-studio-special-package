export type NoteFile = { kind: "image" | "pdf" | "link"; id: string; name: string };

const LINE = /^\[\[(image|pdf|link):([^|\]]+)\|([^\]]*)\]\]$/;

export function splitNote(body: string): { prose: string; files: NoteFile[] } {
  const prose: string[] = [];
  const files: NoteFile[] = [];
  for (const line of body.split("\n")) {
    const match = line.match(LINE);
    if (!match) {
      prose.push(line);
      continue;
    }
    files.push({
      kind: match[1] as NoteFile["kind"],
      id: match[2],
      name: match[3] || match[2],
    });
  }
  return { prose: prose.join("\n"), files };
}

export function joinNote(prose: string, files: NoteFile[]) {
  const marks = files.map((file) => `[[${file.kind}:${file.id}|${file.name.replace(/[|\]]/g, "")}]]`);
  if (!marks.length) return prose;
  const text = prose.replace(/\s+$/, "");
  return text ? `${text}\n${marks.join("\n")}` : marks.join("\n");
}

export function noteBlobIds(body: string) {
  return splitNote(body)
    .files.filter((file) => file.kind !== "link")
    .map((file) => file.id);
}
