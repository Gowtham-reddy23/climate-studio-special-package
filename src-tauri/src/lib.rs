mod agents;
mod calendar;
mod menus;
mod ocr;
mod paste;
mod perms;
mod removebg;

use arboard::Clipboard;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::thread;
use std::time::Duration;
use tauri::{Emitter, LogicalSize, Manager, RunEvent, Size};

const FALLBACK_NOTCH_W: f64 = 196.0;
const FALLBACK_NOTCH_H: f64 = 32.0;
const IDLE_EXTRA_W: f64 = 112.0;
const OPEN_H_W: f64 = 680.0;
const OPEN_H_BODY_H: f64 = 348.0;
const OPEN_V_W: f64 = 440.0;
const OPEN_V_BODY_H: f64 = 528.0;

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
  loop {
    thread::sleep(Duration::from_millis(450));
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
        let ocr = ocr::ocr_rgba(img.width as u32, img.height as u32, &img.bytes);
        let _ = app.emit(
          "cove-clipboard",
          ClipPayload {
            kind: "image",
            text: None,
            rgba: Some(STANDARD.encode(&img.bytes)),
            width: Some(img.width as u32),
            height: Some(img.height as u32),
            source: "Screenshot",
            ocr,
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

const CG_SCREENSAVER_LEVEL_KEY: i32 = 13;

#[cfg(target_os = "macos")]
unsafe fn set_topmost(ns: *mut objc2::runtime::AnyObject) {
  use objc2::msg_send;
  let level = CGWindowLevelForKey(CG_SCREENSAVER_LEVEL_KEY) as isize;
  let _: () = msg_send![ns, setLevel: level];
  // Join every Space, stay put, ignore app cycle, ride along with fullscreen apps.
  let behavior: usize = 1 | 8 | 16 | 64 | 256 | 1024;
  let _: () = msg_send![ns, setCollectionBehavior: behavior];
  let _: () = msg_send![ns, setHidesOnDeactivate: false];
  let _: () = msg_send![ns, setCanHide: false];
  let on_space: bool = msg_send![ns, isOnActiveSpace];
  if !on_space {
    let _: () = msg_send![ns, orderFrontRegardless];
  }
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
      set_topmost(ns);
      let _: () = msg_send![ns, setMovable: false];
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
    let black: *mut AnyObject = msg_send![objc2::class!(NSColor), blackColor];
    let cg_black: *mut std::ffi::c_void = msg_send![black, CGColor];
    let _: () = msg_send![layer, setBackgroundColor: cg_black];
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

fn pin_to_notch(win: &tauri::WebviewWindow, open: bool, layout: &str) -> Result<NotchGeom, String> {
  overlay_window(win);
  let geom = notch_metrics();
  let vertical = layout == "vertical";
  let w = if !open {
    geom.notch_w + IDLE_EXTRA_W
  } else if vertical {
    OPEN_V_W.max(geom.notch_w + IDLE_EXTRA_W)
  } else {
    OPEN_H_W.max(geom.notch_w + IDLE_EXTRA_W)
  };
  let h = if !open {
    geom.notch_h
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
        set_topmost(ns);
        hide_stray_windows(ns);
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      place_notch,
      agents::ai_agents,
      quit_cove,
      ocr::ocr_image,
      paste::set_paste_slots,
      removebg::remove_bg,
      calendar::calendar_events,
      perms::permission_status,
      perms::request_accessibility,
      perms::open_privacy
    ])
    .setup(|app| {
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
                set_topmost(ptr as *mut objc2::runtime::AnyObject);
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
        menus::open_settings(app);
      }
    });
}
