import { useEffect, useState } from "react";
import { BackupButtons } from "./BackupButtons";
import { SkinPicker } from "./SkinPicker";
import { calendarEvents, openPrivacy, permissionStatus, requestAccessibility, type PermSnapshot } from "../native";
import { useStore } from "../store";

export function SettingsWindow() {
  const { state, dispatch } = useStore();
  const [perms, setPerms] = useState<PermSnapshot | null>(null);

  const refresh = () => {
    void permissionStatus().then(setPerms);
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <main className="settings">
      <header className="settings-head">
        <h1>Settings</h1>
        <p>How the notch behaves, how Cove looks, and what macOS is allowed to share.</p>
      </header>

      <section>
        <h2>Notch</h2>
        <div className="seg" role="group" aria-label="Notch shape">
          <button
            type="button"
            className={state.layout === "horizontal" ? "is-on" : ""}
            onClick={() => dispatch({ type: "set-layout", layout: "horizontal" })}
          >
            Wide
          </button>
          <button
            type="button"
            className={state.layout === "vertical" ? "is-on" : ""}
            onClick={() => dispatch({ type: "set-layout", layout: "vertical" })}
          >
            Tall
          </button>
        </div>
        <Pref
          label="Open when the pointer rests"
          detail="Hover the notch to expand. Click still opens it either way."
          on={state.hoverOpen}
          onChange={(value) => dispatch({ type: "set-pref", key: "hoverOpen", value })}
        />
        <Pref
          label="Focus timer in the notch"
          detail="The countdown stays visible after you close the panel."
          on={state.showTimer}
          onChange={(value) => dispatch({ type: "set-pref", key: "showTimer", value })}
        />
        <Pref
          label="Agent rings"
          detail="Claude, Cursor, and Codex usage beside the camera."
          on={state.showRings}
          onChange={(value) => dispatch({ type: "set-pref", key: "showRings", value })}
        />
      </section>

      <section>
        <h2>Look</h2>
        <SkinPicker />
      </section>

      <section>
        <h2>Permissions</h2>
        <article className="perm">
          <div>
            <strong>Accessibility</strong>
            <p>Needed so ⌘⌃1–0 can paste into the app in front.</p>
          </div>
          <span className={perms?.accessibility ? "ok" : "need"}>{perms?.accessibility ? "Allowed" : "Needed"}</span>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              void requestAccessibility().then(() => refresh());
            }}
          >
            Allow
          </button>
          <button type="button" className="btn ghost" onClick={() => void openPrivacy("accessibility")}>
            System Settings
          </button>
        </article>
        <article className="perm">
          <div>
            <strong>Calendar</strong>
            <p>Today’s events in the notch. Cove only reads them.</p>
          </div>
          <span className={perms?.calendar === "allowed" ? "ok" : "need"}>
            {perms?.calendar === "allowed" ? "Allowed" : perms?.calendar === "denied" ? "Off" : "Needed"}
          </span>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              void calendarEvents().finally(refresh);
            }}
          >
            Allow
          </button>
          <button type="button" className="btn ghost" onClick={() => void openPrivacy("calendar")}>
            System Settings
          </button>
        </article>
      </section>

      <section>
        <h2>Backup</h2>
        <BackupButtons />
      </section>
    </main>
  );
}

function Pref({
  label,
  detail,
  on,
  onChange,
}: {
  label: string;
  detail: string;
  on: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="pref">
      <span>
        <strong>{label}</strong>
        <em>{detail}</em>
      </span>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
