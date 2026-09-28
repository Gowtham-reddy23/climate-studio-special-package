use arboard::{Clipboard, ImageData};
use serde::Deserialize;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

#[derive(Clone, Default, Deserialize)]
pub struct PasteSlot {
  pub text: Option<String>,
  pub width: Option<u32>,
  pub height: Option<u32>,
  pub rgba: Option<String>,
}

static SLOTS: OnceLock<Mutex<Vec<PasteSlot>>> = OnceLock::new();
static MANAGER: OnceLock<global_hotkey::GlobalHotKeyManager> = OnceLock::new();

fn slots() -> &'static Mutex<Vec<PasteSlot>> {
  SLOTS.get_or_init(|| Mutex::new(vec![PasteSlot::default(); 10]))
}

#[tauri::command]
pub fn set_paste_slots(slots_in: Vec<PasteSlot>) {
  if let Ok(mut g) = slots().lock() {
    *g = slots_in.into_iter().take(10).collect();
    while g.len() < 10 {
      g.push(PasteSlot::default());
    }
  }
}

pub fn install(app: tauri::AppHandle) {
  use global_hotkey::hotkey::{Code, HotKey, Modifiers};
  use global_hotkey::{GlobalHotKeyEvent, GlobalHotKeyManager, HotKeyState};

  let Ok(manager) = GlobalHotKeyManager::new() else {
    return;
  };
  let mods = Modifiers::CONTROL | Modifiers::SUPER;
  let codes = [
    Code::Digit1,
    Code::Digit2,
    Code::Digit3,
    Code::Digit4,
    Code::Digit5,
    Code::Digit6,
    Code::Digit7,
    Code::Digit8,
    Code::Digit9,
    Code::Digit0,
  ];
  let mut ids = [0u32; 10];
  for (i, code) in codes.iter().enumerate() {
    let hk = HotKey::new(Some(mods), *code);
    ids[i] = hk.id();
    let _ = manager.register(hk);
  }
  let _ = MANAGER.set(manager);

  let handle = app.clone();
  thread::spawn(move || {
    let rx = GlobalHotKeyEvent::receiver();
    loop {
      if let Ok(ev) = rx.try_recv() {
        if ev.state == HotKeyState::Pressed {
          if let Some(idx) = ids.iter().position(|id| *id == ev.id) {
            let pasted = paste_index(idx);
            if let Some(kind) = pasted {
              let _ = handle.emit_toast(kind, idx);
            }
          }
        }
      }
      thread::sleep(Duration::from_millis(40));
    }
  });
}

trait EmitPaste {
  fn emit_toast(&self, kind: &'static str, idx: usize) -> Result<(), tauri::Error>;
}

impl EmitPaste for tauri::AppHandle {
  fn emit_toast(&self, kind: &'static str, idx: usize) -> Result<(), tauri::Error> {
    use tauri::Emitter;
    self.emit("cove-skip-paste", serde_json::json!({ "kind": kind, "index": idx }))
  }
}

fn paste_index(idx: usize) -> Option<&'static str> {
  let slot = slots().lock().ok()?.get(idx).cloned()?;
  let mut cb = Clipboard::new().ok()?;
  let kind = if let (Some(w), Some(h), Some(b64)) = (slot.width, slot.height, slot.rgba.as_ref()) {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    if let Ok(bytes) = STANDARD.decode(b64) {
      let _ = cb.set_image(ImageData {
        width: w as usize,
        height: h as usize,
        bytes: bytes.into(),
      });
      "image"
    } else if let Some(text) = slot.text.as_deref().filter(|t| !t.is_empty()) {
      let _ = cb.set_text(text);
      "text"
    } else {
      return None;
    }
  } else if let Some(text) = slot.text.as_deref().filter(|t| !t.is_empty()) {
    let _ = cb.set_text(text);
    "text"
  } else {
    return None;
  };
  tap_paste();
  Some(kind)
}

fn tap_paste() {
  #[cfg(target_os = "macos")]
  unsafe {
    const KEY_V: u16 = 0x09;
    const CMD: u64 = 0x100000;
    const TAP: u32 = 1;
    let src = CGEventSourceCreate(0);
    if src.is_null() {
      return;
    }
    let down = CGEventCreateKeyboardEvent(src, KEY_V, true);
    let up = CGEventCreateKeyboardEvent(src, KEY_V, false);
    if !down.is_null() {
      CGEventSetFlags(down, CMD);
      CGEventPost(TAP, down);
      CFRelease(down);
    }
    if !up.is_null() {
      CGEventSetFlags(up, CMD);
      CGEventPost(TAP, up);
      CFRelease(up);
    }
    CFRelease(src);
  }
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
  fn CGEventSourceCreate(state: i32) -> *mut std::ffi::c_void;
  fn CGEventCreateKeyboardEvent(source: *mut std::ffi::c_void, key: u16, down: bool) -> *mut std::ffi::c_void;
  fn CGEventSetFlags(event: *mut std::ffi::c_void, flags: u64);
  fn CGEventPost(tap: u32, event: *mut std::ffi::c_void);
  fn CFRelease(cf: *mut std::ffi::c_void);
}
