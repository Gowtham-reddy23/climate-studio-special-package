export type AgentStatus = {
  id: string;
  label: string;
  running: boolean;
  percent?: number | null;
  detail?: string;
  color?: string;
  resets_at?: string | null;
  resets_ms?: number | null;
  threads?: number;
};

export function isNativeApp() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type PermSnapshot = {
  accessibility: boolean;
  calendar: string;
  microphone: string;
  fullDisk: boolean;
};

export async function permissionStatus(): Promise<PermSnapshot> {
  if (!isNativeApp()) return { accessibility: true, calendar: "unavailable", microphone: "unavailable", fullDisk: false };
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<PermSnapshot>("permission_status");
}

export async function requestAccessibility(): Promise<boolean> {
  if (!isNativeApp()) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("request_accessibility");
}

export async function requestMicrophone(): Promise<boolean> {
  if (!isNativeApp()) return true;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("request_microphone");
}

export async function revealPath(path: string) {
  let target = path.trim();
  if (target.startsWith("file://")) {
    try {
      target = decodeURIComponent(new URL(target).pathname);
    } catch {
      return;
    }
  }
  if (!target.startsWith("/") || !isNativeApp()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("reveal_path", { path: target });
}

export async function openLink(url: string) {
  const href = url.trim();
  if (!/^https?:\/\//i.test(href)) return;
  if (!isNativeApp()) {
    window.open(href, "_blank", "noopener");
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_link", { url: href });
}

export async function openPrivacy(kind: "accessibility" | "calendar" | "microphone" | "fulldisk") {
  if (!isNativeApp()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_privacy", { kind });
}

export async function peekUpdate(): Promise<string | null> {
  if (!isNativeApp()) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  return update?.version ?? null;
}

export async function installUpdate(): Promise<void> {
  if (!isNativeApp()) return;
  const { check } = await import("@tauri-apps/plugin-updater");
  const { relaunch } = await import("@tauri-apps/plugin-process");
  const update = await check();
  if (!update) return;
  await update.downloadAndInstall();
  await relaunch();
}

export async function appVersion(): Promise<string> {
  if (!isNativeApp()) return "0.1.0";
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

export async function quitCove() {
  if (!isNativeApp()) {
    window.close();
    return;
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("quit_cove");
  } catch {
    window.close();
  }
}

export async function pollAgents(): Promise<AgentStatus[]> {
  if (!isNativeApp()) {
    return [
      { id: "claude", label: "Claude", running: false, percent: 0, detail: "web" },
      { id: "cursor", label: "Cursor", running: true, percent: 0, detail: "web" },
      { id: "codex", label: "Codex", running: false, percent: 0, detail: "web" },
    ];
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<AgentStatus[]>("ai_agents");
  } catch {
    return [];
  }
}

let placeChain: Promise<void> = Promise.resolve();

export async function syncWindow(open: boolean, layout: "horizontal" | "vertical" | "settings" = "horizontal") {
  if (!isNativeApp()) return;
  const run = placeChain.then(async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const geom = await invoke<{ notch_w: number; notch_h: number }>("place_notch", { open, layout });
    if (geom?.notch_w && geom?.notch_h) {
      document.documentElement.style.setProperty("--notch-w", `${geom.notch_w}px`);
      document.documentElement.style.setProperty("--notch-h", `${geom.notch_h}px`);
    }
  });
  placeChain = run.then(
    () => undefined,
    () => undefined,
  );
  try {
    await run;
  } catch {
    /* web preview */
  }
}

export async function ocrImage(blob: Blob): Promise<string | null> {
  if (!isNativeApp()) return null;
  try {
    const bmp = await createImageBitmap(blob);
    const max = 1280;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < data.length; i += chunk) {
      bin += String.fromCharCode(...data.subarray(i, i + chunk));
    }
    const { invoke } = await import("@tauri-apps/api/core");
    return (await invoke<string | null>("ocr_image", { rgba: btoa(bin), width: w, height: h })) ?? null;
  } catch {
    return null;
  }
}

export type NativeCalEvent = { id: string; title: string; start: string; end: string; calendar: string };

export type GoogleCalendarSnapshot = {
  connected: boolean;
  configured: boolean;
  email: string;
  error: string | null;
  events: NativeCalEvent[];
};

export type GoogleCalendarStatus = {
  connected: boolean;
  configured: boolean;
  email: string;
};

export async function googleCalendarStatus(): Promise<GoogleCalendarStatus | null> {
  if (!isNativeApp()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<GoogleCalendarStatus>("google_calendar_status");
  } catch {
    return null;
  }
}

export async function googleCalendarConfigure(clientId: string, clientSecret: string): Promise<GoogleCalendarStatus> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<GoogleCalendarStatus>("google_calendar_configure", { clientId, clientSecret });
}

export async function googleCalendarConnect(): Promise<GoogleCalendarSnapshot> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<GoogleCalendarSnapshot>("google_calendar_connect");
}

export async function googleCalendarDisconnect(): Promise<GoogleCalendarStatus> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<GoogleCalendarStatus>("google_calendar_disconnect");
}

export async function screenTimeToday(): Promise<{ allowed: boolean; milliseconds: number | null }> {
  if (!isNativeApp()) return { allowed: false, milliseconds: null };
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const snap = await invoke<{ allowed: boolean; milliseconds: number | null }>("screen_time_today");
    if (!snap?.allowed || typeof snap.milliseconds !== "number") return { allowed: false, milliseconds: null };
    return snap;
  } catch {
    return { allowed: false, milliseconds: null };
  }
}

export async function calendarEvents(): Promise<GoogleCalendarSnapshot | null> {
  if (!isNativeApp()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const snap = await invoke<GoogleCalendarSnapshot>("google_calendar_events");
    if (!snap || !Array.isArray(snap.events)) return null;
    return { ...snap, events: snap.events.filter((event) => event.title && event.start) };
  } catch {
    return null;
  }
}

export async function removeBackground(blob: Blob): Promise<Blob | null> {
  if (!isNativeApp()) return null;
  try {
    const bmp = await createImageBitmap(blob);
    const max = 2048;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < data.length; i += chunk) {
      bin += String.fromCharCode(...data.subarray(i, i + chunk));
    }
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{ rgba: string; width: number; height: number } | null>("remove_bg", {
      rgba: btoa(bin),
      width: w,
      height: h,
    });
    if (!result) return null;
    const outBin = atob(result.rgba);
    const outBytes = new Uint8ClampedArray(outBin.length);
    for (let i = 0; i < outBin.length; i += 1) outBytes[i] = outBin.charCodeAt(i);
    const outCanvas = document.createElement("canvas");
    outCanvas.width = result.width;
    outCanvas.height = result.height;
    const outCtx = outCanvas.getContext("2d");
    if (!outCtx) return null;
    outCtx.putImageData(new ImageData(outBytes, result.width, result.height), 0, 0);
    return await new Promise<Blob | null>((resolve) =>
      outCanvas.toBlob((b) => resolve(b), "image/png"),
    );
  } catch {
    return null;
  }
}

export async function syncPasteSlots(
  slots: { text?: string; width?: number; height?: number; rgba?: string }[],
) {
  if (!isNativeApp()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_paste_slots", { slotsIn: slots });
  } catch {
    /* web */
  }
}

export async function listenSkipPaste(onPaste: (index: number, kind: string) => void): Promise<() => void> {
  if (!isNativeApp()) return () => undefined;
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const un = await listen<{ index: number; kind: string }>("cove-skip-paste", (ev) => {
      onPaste(ev.payload.index, ev.payload.kind);
    });
    return () => {
      void un();
    };
  } catch {
    return () => undefined;
  }
}

export async function listenNativeClipboard(
  onText: (text: string, source: string, kind?: "text" | "path") => void,
  onImage: (blob: Blob, source: string, ocr?: string) => void,
): Promise<() => void> {
  if (!isNativeApp()) return () => undefined;
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const un = await listen<{
      kind: "text" | "image" | "path";
      text?: string;
      rgba?: string;
      width?: number;
      height?: number;
      source?: string;
      ocr?: string;
    }>("cove-clipboard", (ev) => {
      const p = ev.payload;
      if ((p.kind === "text" || p.kind === "path") && p.text) onText(p.text, p.source ?? "Clipboard", p.kind);
      if (p.kind === "image" && p.rgba && p.width && p.height) {
        const bin = atob(p.rgba);
        const bytes = new Uint8ClampedArray(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        const canvas = document.createElement("canvas");
        canvas.width = p.width;
        canvas.height = p.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.putImageData(new ImageData(bytes, p.width, p.height), 0, 0);
        canvas.toBlob((blob) => {
          if (blob) onImage(blob, p.source ?? "Screenshot", p.ocr);
        }, "image/png");
      }
    });
    return () => {
      void un();
    };
  } catch {
    return () => undefined;
  }
}
