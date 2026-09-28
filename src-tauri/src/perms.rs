use serde::Serialize;

#[derive(Serialize)]
pub struct PermSnapshot {
  pub accessibility: bool,
  pub calendar: String,
}

#[tauri::command]
pub fn permission_status() -> PermSnapshot {
  PermSnapshot {
    accessibility: accessibility_trusted(false),
    calendar: calendar_state(),
  }
}

#[tauri::command]
pub fn request_accessibility() -> bool {
  accessibility_trusted(true)
}

#[tauri::command]
pub fn open_privacy(kind: String) {
  let url = match kind.as_str() {
    "calendar" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars",
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
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
  static kAXTrustedCheckOptionPrompt: *const std::ffi::c_void;
  fn AXIsProcessTrustedWithOptions(options: *mut objc2::runtime::AnyObject) -> bool;
}
