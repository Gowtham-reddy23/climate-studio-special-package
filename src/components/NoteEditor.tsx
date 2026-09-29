import { useRef, useState } from "react";
import { saveBlob } from "../blobDb";
import { uid } from "../lib";
import { openLink } from "../native";
import { joinNote, splitNote, type NoteFile } from "../noteFiles";
import { applySlashFormat, dropSlash, filterSlash, slashAt, type SlashId } from "../slash";
import { ImagePlay } from "./ImagePlay";
import { loadBlob } from "../blobDb";

export function NoteEditor({
  value,
  onChange,
  placeholder,
  onCommandEnter,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  onCommandEnter?: (line: string) => void;
}) {
  const { prose, files } = splitNote(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState(0);
  const [active, setActive] = useState(0);
  const [closed, setClosed] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [link, setLink] = useState("");
  const pickKind = useRef<"image" | "pdf">("image");
  const slash = slashAt(prose, cursor);
  const items = slash ? filterSlash(slash.query) : [];
  const open = Boolean(slash && items.length && !asking && closed !== `${slash.start}:${slash.query}`);

  const commit = (nextProse: string, nextFiles: NoteFile[], caret?: number) => {
    onChange(joinNote(nextProse, nextFiles));
    if (caret == null) return;
    requestAnimationFrame(() => {
      const node = ref.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(caret, caret);
      setCursor(caret);
    });
  };

  const choose = (id: SlashId) => {
    if (!slash) return;
    setClosed(`${slash.start}:${slash.query}`);
    if (id === "image" || id === "pdf") {
      pickKind.current = id;
      if (fileRef.current) {
        fileRef.current.accept = id === "pdf" ? "application/pdf,.pdf" : "image/*";
        fileRef.current.click();
      }
      return;
    }
    if (id === "link") {
      setAsking(true);
      setLink("");
      return;
    }
    const next = applySlashFormat(prose, slash.start, cursor, id);
    commit(next.text, files, next.end);
  };

  const addLink = () => {
    const href = link.trim();
    if (!slash || !href) return;
    const name = href.replace(/^https?:\/\//, "");
    const cleared = dropSlash(prose, slash.start, cursor);
    commit(cleared, [...files, { kind: "link", id: href, name }], slash.start);
    setAsking(false);
    setLink("");
  };

  return (
    <div className="note-editor">
      <textarea
        ref={ref}
        value={prose}
        placeholder={placeholder}
        onChange={(e) => {
          setCursor(e.target.selectionStart);
          setActive(0);
          commit(e.target.value, files);
        }}
        onClick={(e) => setCursor(e.currentTarget.selectionStart)}
        onKeyUp={(e) => setCursor(e.currentTarget.selectionStart)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            const pos = e.currentTarget.selectionStart;
            const line = prose.slice(0, pos).split("\n").pop() ?? "";
            if (line.trim()) onCommandEnter?.(line.trim());
            return;
          }
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((n) => (n + 1) % items.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((n) => (n - 1 + items.length) % items.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            const item = items[active] ?? items[0];
            if (item) choose(item.id);
          } else if (e.key === "Escape") {
            e.preventDefault();
            if (slash) setClosed(`${slash.start}:${slash.query}`);
          }
        }}
      />
      {open ? (
        <div className="slash-menu" role="listbox" aria-label="Writing">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={index === active}
              className={index === active ? "is-on" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
      {asking ? (
        <form
          className="slash-link"
          onSubmit={(e) => {
            e.preventDefault();
            addLink();
          }}
        >
          <input
            autoFocus
            value={link}
            placeholder="Paste a link"
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAsking(false);
            }}
          />
          <button type="submit" className="btn primary">
            Add
          </button>
        </form>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file || !slash) return;
          const id = uid("file");
          const kind = pickKind.current;
          const cleared = dropSlash(prose, slash.start, cursor);
          const caret = slash.start;
          void saveBlob(id, file).then(() => {
            commit(cleared, [...files, { kind, id, name: file.name }], caret);
          });
        }}
      />
      {files.length ? (
        <div className="note-files">
          {files.map((file) => (
            <NoteFileChip
              key={`${file.kind}:${file.id}`}
              file={file}
              onRemove={() => commit(prose, files.filter((item) => item !== file))}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NoteFileChip({ file, onRemove }: { file: NoteFile; onRemove: () => void }) {
  const open = () => {
    if (file.kind === "link") {
      const href = /^https?:\/\//i.test(file.id) ? file.id : `https://${file.id}`;
      void openLink(href);
      return;
    }
    void loadBlob(file.id).then((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    });
  };

  return (
    <figure className={`note-file is-${file.kind}`}>
      {file.kind === "image" ? <ImagePlay id={file.id} /> : null}
      <button type="button" onClick={open}>
        {file.name}
      </button>
      <button type="button" className="note-file-x" aria-label={`Remove ${file.name}`} onClick={onRemove}>
        ×
      </button>
    </figure>
  );
}
