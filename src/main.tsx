import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { MenuBridge } from "./components/MenuBridge";
import { SettingsWindow } from "./components/SettingsWindow";
import { StoreProvider } from "./store";
import "./styles.css";

function isSettingsWindow() {
  const marked = (window as Window & { __COVE_WINDOW__?: string }).__COVE_WINDOW__ === "settings";
  return marked || new URLSearchParams(location.search).has("settings");
}

function markSettings() {
  document.documentElement.classList.add("is-settings");
  document.documentElement.classList.remove("native");
}

function Root() {
  const [settings, setSettings] = useState(isSettingsWindow);

  useEffect(() => {
    if (settings) {
      markSettings();
      return;
    }
    if (!("__TAURI_INTERNALS__" in window)) return;
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      if (getCurrentWindow().label === "settings") {
        markSettings();
        setSettings(true);
      }
    });
  }, [settings]);

  return (
    <StoreProvider>
      <MenuBridge />
      {settings ? <SettingsWindow /> : <App />}
    </StoreProvider>
  );
}

if (isSettingsWindow()) markSettings();
else if ("__TAURI_INTERNALS__" in window) document.documentElement.classList.add("native");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
