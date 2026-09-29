import { useEffect, useState } from "react";
import { BackupButtons } from "./BackupButtons";
import { appVersion, calendarEvents, openPrivacy, peekUpdate, permissionStatus, requestAccessibility, requestMicrophone, type PermSnapshot } from "../native";
import { useStore } from "../store";

export function SettingsWindow({
  updateVersion = null,
  updating = false,
  onUpdate = () => undefined,
  onChecked = () => undefined,
}: {
  updateVersion?: string | null;
  updating?: boolean;
  onUpdate?: () => void;
  onChecked?: (version: string | null) => void;
} = {}) {
  const { state, dispatch } = useStore();
  const [perms, setPerms] = useState<PermSnapshot | null>(null);
  const [version, setVersion] = useState("0.1.0");
  const [checked, setChecked] = useState(false);

  const refresh = () => {
    void permissionStatus().then(setPerms);
  };

  useEffect(() => {
    refresh();
    void appVersion().then(setVersion);
  }, []);

  const check = () => {
    setChecked(false);
    void peekUpdate()
      .then((next) => {
        onChecked(next);
        setChecked(true);
      })
      .catch(() => {
        onChecked(null);
        setChecked(true);
      });
  };

  return (
    <main className="settings">
      <header className="settings-head">
        <h1>Settings</h1>
        <p>How the notch behaves, and what macOS is allowed to share.</p>
      </header>

      <section>
        <h2>Notch</h2>
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
            <strong>Microphone</strong>
            <p>Voice notes. macOS asks the first time you record.</p>
          </div>
          <span className={perms?.microphone === "allowed" ? "ok" : "need"}>
            {perms?.microphone === "allowed" ? "Allowed" : perms?.microphone === "denied" ? "Off" : "Needed"}
          </span>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              void requestMicrophone().finally(refresh);
            }}
          >
            Allow
          </button>
          <button type="button" className="btn ghost" onClick={() => void openPrivacy("microphone")}>
            System Settings
          </button>
        </article>
        <article className="perm">
          <div>
            <strong>Calendar</strong>
            <p>Today’s events in the notch. The app only reads them.</p>
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
        <h2>Updates</h2>
        <article className="perm">
          <div>
            <strong>Climate Studio Special Package {version}</strong>
            <p>
              {updateVersion
                ? `Version ${updateVersion} is ready. It downloads, replaces this app, and opens again.`
                : checked
                  ? "This is the latest version."
                  : "Looks for a newer version on GitHub."}
            </p>
          </div>
          <button type="button" className="btn primary" disabled={updating} onClick={updateVersion ? onUpdate : check}>
            {updating ? "Installing" : updateVersion ? "Install and relaunch" : "Check"}
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
