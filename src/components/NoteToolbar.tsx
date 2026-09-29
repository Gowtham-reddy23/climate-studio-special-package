import type { NoteMark } from "../noteMarks";

const MARKS: { id: NoteMark; label: string; title: string }[] = [
  { id: "bold", label: "B", title: "Bold" },
  { id: "italic", label: "I", title: "Italic" },
  { id: "heading", label: "H", title: "Heading" },
  { id: "quote", label: "“", title: "Quote" },
  { id: "strike", label: "S", title: "Strikethrough" },
  { id: "bullet", label: "•", title: "Bullet list" },
  { id: "number", label: "1.", title: "Numbered list" },
  { id: "check", label: "☐", title: "Checklist" },
];

export function NoteToolbar({ onMark }: { onMark: (mark: NoteMark) => void }) {
  return (
    <div className="note-tools" role="toolbar" aria-label="Writing tools">
      {MARKS.map((mark) => (
        <button
          key={mark.id}
          type="button"
          title={mark.title}
          data-mark={mark.id}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onMark(mark.id)}
        >
          {mark.label}
        </button>
      ))}
    </div>
  );
}
