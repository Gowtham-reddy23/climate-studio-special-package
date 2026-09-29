import type { NoteMark } from "../noteMarks";

const MARKS: { id: NoteMark; label: string }[] = [
  { id: "bullet", label: "• List" },
  { id: "number", label: "1. List" },
  { id: "check", label: "☐ Check" },
];

export function NoteToolbar({ onMark }: { onMark: (mark: NoteMark) => void }) {
  return (
    <div className="note-tools" role="toolbar" aria-label="Note formatting">
      {MARKS.map((mark) => (
        <button
          key={mark.id}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onMark(mark.id)}
        >
          {mark.label}
        </button>
      ))}
    </div>
  );
}
