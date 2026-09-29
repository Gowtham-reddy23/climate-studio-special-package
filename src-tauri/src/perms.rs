use serde::Serialize;

#[derive(Serialize)]
pub struct PermSnapshot {
  pub accessibility: bool,
  pub calendar: String,
  pub microphone: String,
}

#[tauri::command]
pub fn permission_status() -> PermSnapshot {
  PermSnapshot {
    accessibility: accessibility_trusted(false),
    calendar: calendar_state(),
    microphone: microphone_state(),
  }
}

#[tauri::command]
pub fn request_microphone() -> bool {
  request_microphone_access()
}

#[tauri::command]
pub fn request_accessibility() -> bool {
  accessibility_trusted(true)
}

#[tauri::command]
pub fn open_privacy(kind: String) {
  let url = match kind.as_str() {
    "calendar" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars",
    "microphone" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    _ => "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  };
  let _ = std::process::Command::new("open").arg(url).spawn();
}

fn accessibility_trusted(prompt: bool) -> bool {
  #[cfg(target_os = "macos")]
  unsafe {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    let key = kAXTrustedCheckOptionPrompt as *mut AnyObject;
    let flag: *mut AnyObject = msg_send![objc2::class!(NSNumber), numberWithBool: prompt];
    let opts: *mut AnyObject = msg_send![objc2::class!(NSDictionary), dictionaryWithObject: flag, forKey: key];
    return AXIsProcessTrustedWithOptions(opts);
  }
  #[cfg(not(target_os = "macos"))]
  {
    let _ = prompt;
    true
  }
}

fn microphone_state() -> String {
  #[cfg(target_os = "macos")]
  unsafe {
    mic_status()
  }
  #[cfg(not(target_os = "macos"))]
  "unavailable".into()
}

fn request_microphone_access() -> bool {
  #[cfg(target_os = "macos")]
  unsafe {
    let status = mic_status();
    if status == "allowed" {
      return true;
    }
    if status == "denied" || status == "unavailable" {
      return false;
    }
    let Some(cls) = objc2::runtime::AnyClass::get(c"AVCaptureDevice") else {
      return false;
    };
    let media = av_audio();
    let (tx, rx) = std::sync::mpsc::channel();
    let block = block2::RcBlock::new(move |granted: objc2::runtime::Bool| {
      let _ = tx.send(granted.as_bool());
    });
    let _: () = objc2::msg_send![cls, requestAccessForMediaType: media, completionHandler: &*block];
    return rx.recv_timeout(std::time::Duration::from_secs(120)).unwrap_or(false);
  }
  #[cfg(not(target_os = "macos"))]
  true
}

#[cfg(target_os = "macos")]
unsafe fn mic_status() -> String {
  use objc2::msg_send;
  let Some(cls) = objc2::runtime::AnyClass::get(c"AVCaptureDevice") else {
    return "unavailable".into();
  };
  let status: isize = msg_send![cls, authorizationStatusForMediaType: av_audio()];
  match status {
    3 => "allowed".into(),
    2 | 1 => "denied".into(),
    _ => "needed".into(),
  }
}

#[cfg(target_os = "macos")]
unsafe fn av_audio() -> *mut objc2::runtime::AnyObject {
  objc2::msg_send![objc2::class!(NSString), stringWithUTF8String: b"soun\0".as_ptr()]
}

fn calendar_state() -> String {
  #[cfg(target_os = "macos")]
  unsafe {
    use objc2::msg_send;
    use objc2::runtime::AnyClass;
    let Some(store_cls) = AnyClass::get(c"EKEventStore") else {
      return "unavailable".into();
    };
    let status: isize = msg_send![store_cls, authorizationStatusForEntityType: 0isize];
    return match status {
      3 => "allowed".into(),
      2 | 1 => "denied".into(),
      _ => "needed".into(),
    };
  }
  #[cfg(not(target_os = "macos"))]
  "unavailable".into()
}

#[cfg(target_os = "macos")]
#[link(name = "AVFoundation", kind = "framework")]
extern "C" {}

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
  static kAXTrustedCheckOptionPrompt: *const std::ffi::c_void;
  fn AXIsProcessTrustedWithOptions(options: *mut objc2::runtime::AnyObject) -> bool;
}
