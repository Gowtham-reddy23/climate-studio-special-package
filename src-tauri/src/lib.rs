mod agents;
mod calendar;
mod gcal;
mod menus;
mod ocr;
mod paste;
mod perms;
mod removebg;
mod screentime;

use arboard::Clipboard;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::thread;
use std::time::Duration;
use tauri::{Emitter, LogicalSize, Manager, RunEvent, Size};

const FALLBACK_NOTCH_W: f64 = 196.0;
const FALLBACK_NOTCH_H: f64 = 32.0;
const IDLE_EXTRA_W: f64 = 240.0;
const OPEN_H_W: f64 = 1040.0;
const OPEN_H_BODY_H: f64 = 460.0;
const OPEN_V_W: f64 = 440.0;
const OPEN_V_BODY_H: f64 = 528.0;
const OPEN_SETTINGS_W: f64 = 560.0;
const OPEN_SETTINGS_BODY_H: f64 = 640.0;

#[derive(Clone, Serialize)]
struct NotchGeom {
  notch_w: f64,
  notch_h: f64,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct CGPoint {
  x: f64,
  y: f64,
}
#[repr(C)]
#[derive(Clone, Copy)]
struct CGSize {
  width: f64,
  height: f64,
}
#[repr(C)]
#[derive(Clone, Copy)]
struct CGRect {
  origin: CGPoint,
  size: CGSize,
}
#[repr(C)]
#[derive(Clone, Copy)]
struct NSEdgeInsets {
  top: f64,
  left: f64,
  bottom: f64,
  right: f64,
}

unsafe impl objc2::encode::Encode for CGPoint {
  const ENCODING: objc2::encode::Encoding =
    objc2::encode::Encoding::Struct("CGPoint", &[f64::ENCODING, f64::ENCODING]);
}
unsafe impl objc2::encode::Encode for CGSize {
  const ENCODING: objc2::encode::Encoding =
    objc2::encode::Encoding::Struct("CGSize", &[f64::ENCODING, f64::ENCODING]);
}
unsafe impl objc2::encode::Encode for CGRect {
  const ENCODING: objc2::encode::Encoding =
    objc2::encode::Encoding::Struct("CGRect", &[CGPoint::ENCODING, CGSize::ENCODING]);
}
unsafe impl objc2::encode::Encode for NSEdgeInsets {
  const ENCODING: objc2::encode::Encoding = objc2::encode::Encoding::Struct(
    "NSEdgeInsets",
    &[f64::ENCODING, f64::ENCODING, f64::ENCODING, f64::ENCODING],
  );
}

fn notch_metrics() -> NotchGeom {
  #[cfg(target_os = "macos")]
  unsafe {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    let screen: *mut AnyObject = msg_send![objc2::class!(NSScreen), mainScreen];
    if !screen.is_null() {
      let frame: CGRect = msg_send![screen, frame];
      let left: CGRect = msg_send![screen, auxiliaryTopLeftArea];
      let right: CGRect = msg_send![screen, auxiliaryTopRightArea];
      let insets: NSEdgeInsets = msg_send![screen, safeAreaInsets];
      let w = frame.size.width - left.size.width - right.size.width;
      let h = insets.top;
      if left.size.width > 8.0 && right.size.width > 8.0 && w > 80.0 && w < 360.0 && h > 16.0 {
        return NotchGeom {
          notch_w: w.round(),
          notch_h: h.round(),
        };
      }
    }
  }
  NotchGeom {
    notch_w: FALLBACK_NOTCH_W,
    notch_h: FALLBACK_NOTCH_H,
  }
}

#[derive(Clone, Serialize)]
struct ClipPayload {
  kind: &'static str,
  #[serde(skip_serializing_if = "Option::is_none")]
  text: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  rgba: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  width: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  height: Option<u32>,
  source: &'static str,
  #[serde(skip_serializing_if = "Option::is_none")]
  ocr: Option<String>,
}

fn watch_clipboard(app: tauri::AppHandle) {
  let mut last_text = String::new();
  let mut last_img = 0usize;
  let mut last_files = String::new();
  loop {
    thread::sleep(Duration::from_millis(450));
    let files = pasteboard_files();
    if !files.is_empty() {
      let key = files.join("\n");
      if key != last_files {
        last_files = key;
        for path in files {
          let _ = app.emit(
            "cove-clipboard",
            ClipPayload {
              kind: "path",
              text: Some(path),
              rgba: None,
              width: None,
              height: None,
              source: "Finder",
              ocr: None,
            },
          );
        }
      }
      continue;
    }
    last_files.clear();
    let mut cb = match Clipboard::new() {
      Ok(c) => c,
      Err(_) => continue,
    };
    if let Ok(text) = cb.get_text() {
      let t = text.trim().to_string();
      if !t.is_empty() && t != last_text {
        last_text = t.clone();
        let _ = app.emit(
          "cove-clipboard",
          ClipPayload {
            kind: "text",
            text: Some(t),
            rgba: None,
            width: None,
            height: None,
            source: "Clipboard",
            ocr: None,
          },
        );
      }
    }
    if let Ok(img) = cb.get_image() {
      let n = img.bytes.len();
      if n > 800 && n != last_img {
        last_img = n;
        let _ = app.emit(
          "cove-clipboard",
          ClipPayload {
            kind: "image",
            text: None,
            rgba: Some(STANDARD.encode(&img.bytes)),
            width: Some(img.width as u32),
            height: Some(img.height as u32),
            source: "Screenshot",
            ocr: None,
          },
        );
      }
    }
  }
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
  fn CGWindowLevelForKey(key: i32) -> i32;
}

const CG_STATUS_LEVEL_KEY: i32 = 9;

#[cfg(target_os = "macos")]
static PANEL_OPEN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
#[cfg(target_os = "macos")]
static NOTCH_W: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(196);
#[cfg(target_os = "macos")]
static NOTCH_H: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(32);

#[cfg(target_os = "macos")]
unsafe fn set_topmost(ns: *mut objc2::runtime::AnyObject, _open: bool) {
  use objc2::msg_send;
  // Status level is above other apps and the menu bar, and below popup menus.
  // The notch stays visible while another app is focused, and that app's menus still open.
  let level = CGWindowLevelForKey(CG_STATUS_LEVEL_KEY) as isize;
  let _: () = msg_send![ns, setLevel: level];
  // Join every Space, stay put, ignore app cycle, ride along with fullscreen apps.
  let behavior: usize = 1 | 8 | 16 | 64 | 256 | 1024;
  let _: () = msg_send![ns, setCollectionBehavior: behavior];
  let _: () = msg_send![ns, setHidesOnDeactivate: false];
  let _: () = msg_send![ns, setCanHide: false];
  let _: () = msg_send![ns, orderFrontRegardless];
}

fn overlay_window(win: &tauri::WebviewWindow) {
  let _ = win.set_shadow(false);
  let _ = win.set_skip_taskbar(true);
  let _ = win.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));

  #[cfg(target_os = "macos")]
  unsafe {
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, AnyObject};

    if let Ok(ptr) = win.ns_window() {
      let ns = ptr as *mut AnyObject;
      let cls = notch_window_class();
      let _ = objc2::ffi::object_setClass(ns, cls as *const AnyClass);
      let _: () = msg_send![ns, setOpaque: false];
      let _: () = msg_send![ns, setHasShadow: false];
      let clear: *mut AnyObject = msg_send![objc2::class!(NSColor), clearColor];
      let _: () = msg_send![ns, setBackgroundColor: clear];
      set_topmost(ns, PANEL_OPEN.load(std::sync::atomic::Ordering::Relaxed));
      let _: () = msg_send![ns, setMovable: false];
      let _: () = msg_send![ns, setIgnoresMouseEvents: false];
      let _: () = msg_send![ns, setAcceptsMouseMovedEvents: true];
    }
    if let Ok(view_ptr) = win.ns_view() {
      let view = view_ptr as *mut AnyObject;
      let _: () = msg_send![view, setWantsLayer: true];
      if let Some(wk) = AnyClass::get(c"WKWebView") {
        let is_wk: bool = msg_send![view, isKindOfClass: wk];
        if is_wk {
          let key: *mut AnyObject = msg_send![
            objc2::class!(NSString),
            stringWithUTF8String: b"drawsBackground\0".as_ptr() as *const i8
          ];
          let no: *mut AnyObject = msg_send![objc2::class!(NSNumber), numberWithBool: false];
          let _: () = msg_send![view, setValue: no, forKey: key];
        }
        let subviews: *mut AnyObject = msg_send![view, subviews];
        let n: usize = msg_send![subviews, count];
        for i in 0..n {
          let sub: *mut AnyObject = msg_send![subviews, objectAtIndex: i];
          let is_wk: bool = msg_send![sub, isKindOfClass: wk];
          if is_wk {
            let key: *mut AnyObject = msg_send![
              objc2::class!(NSString),
              stringWithUTF8String: b"drawsBackground\0".as_ptr() as *const i8
            ];
            let no: *mut AnyObject = msg_send![objc2::class!(NSNumber), numberWithBool: false];
            let _: () = msg_send![sub, setValue: no, forKey: key];
          }
        }
      }
    }
  }
}

#[cfg(target_os = "macos")]
unsafe fn hide_stray_windows(keep: *mut objc2::runtime::AnyObject) {
  use objc2::msg_send;
  use objc2::runtime::AnyObject;
  let app: *mut AnyObject = msg_send![objc2::class!(NSApplication), sharedApplication];
  let windows: *mut AnyObject = msg_send![app, windows];
  let n: usize = msg_send![windows, count];
  for i in 0..n {
    let w: *mut AnyObject = msg_send![windows, objectAtIndex: i];
    if w != keep {
      let frame: CGRect = msg_send![w, frame];
      let menubar_strip = frame.size.height <= 40.0 && frame.size.width > 600.0;
      let leftover_square = frame.size.width >= 480.0 && frame.size.width <= 520.0 && frame.size.height >= 480.0 && frame.size.height <= 520.0;
      if menubar_strip || leftover_square {
        let _: () = msg_send![w, setAlphaValue: 0.0f64];
        let _: bool = msg_send![w, setIgnoresMouseEvents: true];
      }
    }
  }
}

#[cfg(target_os = "macos")]
unsafe fn clear_mask(view: *mut objc2::runtime::AnyObject) {
  use objc2::msg_send;
  use objc2::runtime::AnyObject;
  let _: () = msg_send![view, setWantsLayer: true];
  let layer: *mut AnyObject = msg_send![view, layer];
  if !layer.is_null() {
    let none: *mut AnyObject = std::ptr::null_mut();
    let _: () = msg_send![layer, setMask: none];
    let _: () = msg_send![layer, setOpaque: false];
    let _: () = msg_send![layer, setBackgroundColor: none];
  }
}

#[cfg(target_os = "macos")]
fn notch_window_class() -> &'static objc2::runtime::AnyClass {
  static INIT: std::sync::OnceLock<&'static objc2::runtime::AnyClass> = std::sync::OnceLock::new();
  INIT.get_or_init(|| {
    use objc2::runtime::{AnyClass, ClassBuilder};
    use objc2::sel;
    if let Some(existing) = AnyClass::get(c"CoveNotchWindow") {
      return existing;
    }
    let mut builder = ClassBuilder::new(c"CoveNotchWindow", objc2::class!(NSWindow))
      .expect("CoveNotchWindow");
    unsafe {
      builder.add_method(
        sel!(constrainFrameRect:toScreen:),
        constrain_frame as unsafe extern "C" fn(_, _, _, _) -> _,
      );
      builder.add_method(
        sel!(canBecomeKeyWindow),
        yes_window as unsafe extern "C" fn(_, _) -> objc2::runtime::Bool,
      );
      builder.add_method(
        sel!(canBecomeMainWindow),
        yes_window as unsafe extern "C" fn(_, _) -> objc2::runtime::Bool,
      );
    }
    builder.register()
  })
}

#[cfg(target_os = "macos")]
unsafe extern "C" fn constrain_frame(
  _this: *mut objc2::runtime::AnyObject,
  _cmd: objc2::runtime::Sel,
  frame_rect: CGRect,
  _screen: *mut objc2::runtime::AnyObject,
) -> CGRect {
  frame_rect
}

#[cfg(target_os = "macos")]
unsafe extern "C" fn yes_window(_this: *mut objc2::runtime::AnyObject, _cmd: objc2::runtime::Sel) -> objc2::runtime::Bool {
  objc2::runtime::Bool::YES
}

#[cfg(target_os = "macos")]
unsafe fn update_clickthrough(ns: *mut objc2::runtime::AnyObject) {
  use objc2::msg_send;
  use std::sync::atomic::Ordering;
  let mouse: CGPoint = msg_send![objc2::class!(NSEvent), mouseLocation];
  let frame: CGRect = msg_send![ns, frame];
  let x = mouse.x - frame.origin.x;
  let y = mouse.y - frame.origin.y;
  let inside = x >= 0.0 && y >= 0.0 && x <= frame.size.width && y <= frame.size.height;
  if !inside {
    let _: () = msg_send![ns, setIgnoresMouseEvents: true];
    return;
  }
  let mut menu_h = NOTCH_H.load(Ordering::Relaxed) as f64;
  let screen: *mut objc2::runtime::AnyObject = msg_send![ns, screen];
  if !screen.is_null() {
    let sframe: CGRect = msg_send![screen, frame];
    let visible: CGRect = msg_send![screen, visibleFrame];
    let h = (sframe.origin.y + sframe.size.height) - (visible.origin.y + visible.size.height);
    if (12.0..80.0).contains(&h) {
      menu_h = h;
    }
  }
  let from_top = frame.size.height - y;
  let notch_w = NOTCH_W.load(Ordering::Relaxed) as f64;
  let cx = frame.size.width / 2.0;
  let in_band = from_top <= menu_h + 1.0;
  let open = PANEL_OPEN.load(Ordering::Relaxed);
  let grab = if open { 360.0_f64.max(notch_w) } else { notch_w };
  let in_notch = in_band && (x - cx).abs() <= grab / 2.0 + 8.0;
  let beside = cx + notch_w / 2.0 + 2.0;
  let in_pill = !open && in_band && x >= beside && x <= beside + 200.0;
  // The menu-bar band stays with the Mac menu bar, except the camera notch and the idle pill.
  let hit = if in_band { in_notch || in_pill } else { open };
  let _: () = msg_send![ns, setIgnoresMouseEvents: !hit];
}

fn pin_to_notch(win: &tauri::WebviewWindow, open: bool, layout: &str) -> Result<NotchGeom, String> {
  #[cfg(target_os = "macos")]
  {
    use std::sync::atomic::Ordering;
    PANEL_OPEN.store(open, Ordering::Relaxed);
  }
  overlay_window(win);
  let geom = notch_metrics();
  #[cfg(target_os = "macos")]
  {
    NOTCH_W.store(geom.notch_w.round().clamp(80.0, 400.0) as u32, std::sync::atomic::Ordering::Relaxed);
    NOTCH_H.store(geom.notch_h.round().clamp(20.0, 80.0) as u32, std::sync::atomic::Ordering::Relaxed);
  }
  let vertical = layout == "vertical";
  let settings = layout == "settings";
  let w = if !open {
    geom.notch_w + IDLE_EXTRA_W
  } else if settings {
    OPEN_SETTINGS_W.max(geom.notch_w + IDLE_EXTRA_W)
  } else if vertical {
    OPEN_V_W.max(geom.notch_w + IDLE_EXTRA_W)
  } else {
    OPEN_H_W.max(geom.notch_w + IDLE_EXTRA_W)
  };
  let h = if !open {
    geom.notch_h
  } else if settings {
    geom.notch_h + OPEN_SETTINGS_BODY_H
  } else if vertical {
    geom.notch_h + OPEN_V_BODY_H
  } else {
    geom.notch_h + OPEN_H_BODY_H
  };
  win
    .set_size(Size::Logical(LogicalSize::new(w, h)))
    .map_err(|e| e.to_string())?;

  #[cfg(target_os = "macos")]
  unsafe {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    if let Ok(ptr) = win.ns_window() {
      let ns = ptr as *mut AnyObject;
      let screen: *mut AnyObject = msg_send![objc2::class!(NSScreen), mainScreen];
      if !screen.is_null() {
        let sframe: CGRect = msg_send![screen, frame];
        let frame = CGRect {
          origin: CGPoint {
            x: sframe.origin.x + ((sframe.size.width - w) / 2.0).round(),
            y: sframe.origin.y + sframe.size.height - h,
          },
          size: CGSize { width: w, height: h },
        };
        let _: () = msg_send![ns, setFrame: frame, display: true];
        set_topmost(ns, open);
        if open {
          let is_key: bool = msg_send![ns, isKeyWindow];
          if !is_key {
            let _: () = msg_send![ns, makeKeyAndOrderFront: std::ptr::null::<AnyObject>()];
          }
        }
        hide_stray_windows(ns);
        update_clickthrough(ns);
      }
    }
    if let Ok(view_ptr) = win.ns_view() {
      clear_mask(view_ptr as *mut objc2::runtime::AnyObject);
    }
  }

  #[cfg(not(target_os = "macos"))]
  {
    let monitor = win
      .current_monitor()
      .map_err(|e| e.to_string())?
      .ok_or_else(|| "no monitor".to_string())?;
    let mpos = monitor.position();
    let msize = monitor.size();
    let scale = monitor.scale_factor();
    let phys_w = (w * scale).round() as i32;
    let x = mpos.x + (msize.width as i32 - phys_w) / 2;
    let _ = win.set_position(tauri::PhysicalPosition::new(x, mpos.y));
  }

  let _ = win.eval(&format!(
    "document.documentElement.classList.add('native');document.documentElement.style.setProperty('--notch-w','{}px');document.documentElement.style.setProperty('--notch-h','{}px');",
    geom.notch_w, geom.notch_h
  ));
  Ok(geom)
}

#[tauri::command]
fn place_notch(app: tauri::AppHandle, open: bool, layout: Option<String>) -> Result<NotchGeom, String> {
  let win = app.get_webview_window("main").ok_or("no window")?;
  pin_to_notch(&win, open, layout.as_deref().unwrap_or("horizontal"))
}

#[tauri::command]
fn quit_cove(app: tauri::AppHandle) {
  app.exit(0);
}

#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
  let path = path.trim();
  if !path.starts_with('/') || path.contains('\0') || path.contains('\n') {
    return Err("not a file path".into());
  }
  std::process::Command::new("open")
    .arg("-R")
    .arg(path)
    .spawn()
    .map(|_| ())
    .map_err(|e| e.to_string())
}

fn pasteboard_files() -> Vec<String> {
  #[cfg(target_os = "macos")]
  {
    unsafe { objc2::rc::autoreleasepool(|_| read_file_urls()) }
  }
  #[cfg(not(target_os = "macos"))]
  {
    Vec::new()
  }
}

#[cfg(target_os = "macos")]
unsafe fn ns_utf8(s: &str) -> *mut objc2::runtime::AnyObject {
  use objc2::msg_send;
  let c = std::ffi::CString::new(s).unwrap_or_default();
  msg_send![objc2::class!(NSString), stringWithUTF8String: c.as_ptr()]
}

#[cfg(target_os = "macos")]
unsafe fn file_url_path(s: *mut objc2::runtime::AnyObject) -> Option<String> {
  use objc2::msg_send;
  use objc2::runtime::AnyObject;
  if s.is_null() {
    return None;
  }
  let url: *mut AnyObject = msg_send![objc2::class!(NSURL), URLWithString: s];
  if url.is_null() {
    return None;
  }
  let is_file: bool = msg_send![url, isFileURL];
  if !is_file {
    return None;
  }
  let path: *mut AnyObject = msg_send![url, path];
  if path.is_null() {
    return None;
  }
  let utf8: *const i8 = msg_send![path, UTF8String];
  if utf8.is_null() {
    return None;
  }
  let owned = std::ffi::CStr::from_ptr(utf8).to_string_lossy().into_owned();
  if owned.starts_with('/') { Some(owned) } else { None }
}

#[cfg(target_os = "macos")]
unsafe fn read_file_urls() -> Vec<String> {
  use objc2::msg_send;
  use objc2::runtime::AnyObject;
  let pb: *mut AnyObject = msg_send![objc2::class!(NSPasteboard), generalPasteboard];
  if pb.is_null() {
    return Vec::new();
  }
  let mut out = Vec::new();
  let items: *mut AnyObject = msg_send![pb, pasteboardItems];
  if !items.is_null() {
    let n: usize = msg_send![items, count];
    let typ = ns_utf8("public.file-url");
    for i in 0..n.min(40) {
      let item: *mut AnyObject = msg_send![items, objectAtIndex: i];
      if item.is_null() {
        continue;
      }
      let s: *mut AnyObject = msg_send![item, stringForType: typ];
      if let Some(path) = file_url_path(s) {
        if !out.contains(&path) {
          out.push(path);
        }
      }
    }
  }
  if out.is_empty() {
    let typ = ns_utf8("public.file-url");
    let s: *mut AnyObject = msg_send![pb, stringForType: typ];
    if let Some(path) = file_url_path(s) {
      out.push(path);
    }
  }
  out
}

#[tauri::command]
fn open_link(url: String) -> Result<(), String> {
  let url = url.trim();
  if !(url.starts_with("https://") || url.starts_with("http://")) {
    return Err("not a web link".into());
  }
  std::process::Command::new("open")
    .arg(&url)
    .spawn()
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      place_notch,
      agents::ai_agents,
      quit_cove,
      open_link,
      reveal_path,
      ocr::ocr_image,
      paste::set_paste_slots,
      removebg::remove_bg,
      calendar::calendar_events,
      gcal::google_calendar_status,
      gcal::google_calendar_configure,
      gcal::google_calendar_connect,
      gcal::google_calendar_disconnect,
      gcal::google_calendar_events,
      screentime::screen_time_today,
      perms::permission_status,
      perms::request_accessibility,
      perms::request_microphone,
      perms::open_privacy
    ])
    .setup(|app| {
      app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
      app.handle().plugin(tauri_plugin_process::init())?;
      #[cfg(target_os = "macos")]
      app.set_activation_policy(tauri::ActivationPolicy::Regular);
      let _ = menus::install(app);

      paste::install(app.handle().clone());
      let handle = app.handle().clone();
      thread::spawn(move || watch_clipboard(handle));
      if let Some(win) = app.get_webview_window("main") {
        let _ = pin_to_notch(&win, false, "horizontal");
        let keep = win.clone();
        thread::spawn(move || loop {
          thread::sleep(Duration::from_secs(2));
          let w = keep.clone();
          let w2 = w.clone();
          let _ = w.run_on_main_thread(move || {
            #[cfg(target_os = "macos")]
            unsafe {
              if let Ok(ptr) = w2.ns_window() {
                set_topmost(
                  ptr as *mut objc2::runtime::AnyObject,
                  PANEL_OPEN.load(std::sync::atomic::Ordering::Relaxed),
                );
              }
            }
          });
        });
        let pass = win.clone();
        thread::spawn(move || loop {
          thread::sleep(Duration::from_millis(40));
          let w = pass.clone();
          let w2 = w.clone();
          let _ = w.run_on_main_thread(move || {
            #[cfg(target_os = "macos")]
            unsafe {
              if let Ok(ptr) = w2.ns_window() {
                update_clickthrough(ptr as *mut objc2::runtime::AnyObject);
              }
            }
          });
        });
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("cove failed to start")
    .run(|app, event| {
      if let RunEvent::Reopen { .. } = event {
        menus::open_panel(app);
      }
    });
}
