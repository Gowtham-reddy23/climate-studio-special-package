import { useEffect, useRef } from "react";
import { isNativeApp } from "../native";
import { useStore } from "../store";

export function MenuBridge() {
  const { state, dispatch } = useStore();
  const settings = document.documentElement.classList.contains("is-settings");
  const stateRef = useRef(state);
  const fileRef = useRef<HTMLInputElement>(null);
  stateRef.current = state;

  useEffect(() => {
    if (!isNativeApp() || settings) return;
    let stop = () => undefined as void;
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      const un = await listen<string>("cove-menu", (ev) => {
        const id = ev.payload;
        const cur = stateRef.current;
        if (id === "toggle-timer") dispatch({ type: "set-pref", key: "showTimer", value: !cur.showTimer });
        if (id === "toggle-rings") dispatch({ type: "set-pref", key: "showRings", value: !cur.showRings });
        if (id === "toggle-hover") dispatch({ type: "set-pref", key: "hoverOpen", value: !cur.hoverOpen });
        if (id === "export") {
          const blob = new Blob([JSON.stringify(cur, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `perch-backup-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }
        if (id === "import") fileRef.current?.click();
        if (id === "settings-inline") window.dispatchEvent(new Event("cove-settings"));
        if (id === "open-panel") window.dispatchEvent(new Event("cove-open"));
      });
      stop = () => {
        void un();
      };
    });
    return () => stop();
  }, [dispatch]);

  return (
    <input
      ref={fileRef}
      type="file"
      accept="application/json"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        void file.text().then((text) => {
          try {
            const parsed = JSON.parse(text);
            if (parsed?.clips && parsed?.tasks) dispatch({ type: "hydrate", state: { ...stateRef.current, ...parsed } });
          } catch {
            /* ignore */
          }
        });
      }}
    />
  );
}
