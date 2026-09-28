import { useRef } from "react";
import { useStore } from "../store";
import { seed } from "../seed";
import type { AppState } from "../types";

export function BackupButtons() {
  const { state, dispatch } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const onExport = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cove-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<AppState>;
      if (!parsed.clips || !parsed.tasks) return;
      dispatch({ type: "hydrate", state: { ...seed, ...parsed } as AppState });
    } catch {
      /* ignore bad file */
    }
  };

  return (
    <div className="backup">
      <button className="skin-chip" onClick={onExport}>
        Export
      </button>
      <button className="skin-chip" onClick={() => fileRef.current?.click()}>
        Import
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
      />
    </div>
  );
}
