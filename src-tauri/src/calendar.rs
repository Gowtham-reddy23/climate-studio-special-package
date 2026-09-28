use serde::Serialize;

// Embed a usage-description Info.plist into the dev binary so macOS TCC will
// show the calendar-access prompt (a bare `cargo run` binary has no bundle).
#[cfg(target_os = "macos")]
#[used]
#[link_section = "__TEXT,__info_plist"]
static INFO_PLIST: [u8; include_bytes!("../Info.dev.plist").len()] =
  *include_bytes!("../Info.dev.plist");

// Force-link EventKit so its Objective-C classes are available at runtime.
#[cfg(target_os = "macos")]
#[link(name = "EventKit", kind = "framework")]
extern "C" {}

#[derive(Serialize, Default, Clone)]
pub struct CalEvent {
  pub id: String,
  pub title: String,
  pub start: String,
  pub end: String,
  pub calendar: String,
}

#[tauri::command]
pub fn calendar_events() -> Vec<CalEvent> {
  #[cfg(target_os = "macos")]
  {
    unsafe { read_events() }
  }
  #[cfg(not(target_os = "macos"))]
  {
    Vec::new()
  }
}

#[cfg(target_os = "macos")]
unsafe fn ns_string(s: &str) -> *mut objc2::runtime::AnyObject {
  use objc2::msg_send;
  let c = std::ffi::CString::new(s).unwrap_or_default();
  msg_send![objc2::class!(NSString), stringWithUTF8String: c.as_ptr()]
}

#[cfg(target_os = "macos")]
unsafe fn ns_to_string(s: *mut objc2::runtime::AnyObject) -> String {
  use objc2::msg_send;
  if s.is_null() {
    return String::new();
  }
  let utf8: *const i8 = msg_send![s, UTF8String];
  if utf8.is_null() {
    return String::new();
  }
  std::ffi::CStr::from_ptr(utf8).to_string_lossy().into_owned()
}

#[cfg(target_os = "macos")]
unsafe fn read_events() -> Vec<CalEvent> {
  use block2::RcBlock;
  use objc2::msg_send;
  use objc2::runtime::{AnyClass, AnyObject, Bool};
  use std::time::Duration;

  let Some(store_cls) = AnyClass::get(c"EKEventStore") else {
    return Vec::new();
  };
  let store: *mut AnyObject = msg_send![store_cls, new];
  if store.is_null() {
    return Vec::new();
  }

  // EKEntityTypeEvent = 0
  let status: isize = msg_send![store_cls, authorizationStatusForEntityType: 0isize];

  // 0 = notDetermined, 3 = fullAccess (macOS 14+), 2 = denied
  if status == 0 {
    let (tx, rx) = std::sync::mpsc::channel::<bool>();
    let block = RcBlock::new(move |granted: Bool, _err: *mut AnyObject| {
      let _ = tx.send(granted.as_bool());
    });
    let _: () = msg_send![store, requestFullAccessToEventsWithCompletion: &*block];
    let granted = rx.recv_timeout(Duration::from_secs(60)).unwrap_or(false);
    if !granted {
      return Vec::new();
    }
  } else if status != 3 {
    return Vec::new();
  }

  let date_cls = objc2::class!(NSDate);
  let start: *mut AnyObject = msg_send![date_cls, dateWithTimeIntervalSinceNow: 0.0f64];
  let end: *mut AnyObject = msg_send![date_cls, dateWithTimeIntervalSinceNow: 172_800.0f64];

  let predicate: *mut AnyObject = msg_send![
    store,
    predicateForEventsWithStartDate: start,
    endDate: end,
    calendars: std::ptr::null_mut::<AnyObject>()
  ];
  if predicate.is_null() {
    return Vec::new();
  }
  let events: *mut AnyObject = msg_send![store, eventsMatchingPredicate: predicate];
  if events.is_null() {
    return Vec::new();
  }
  let n: usize = msg_send![events, count];

  let fmt: *mut AnyObject = msg_send![objc2::class!(NSDateFormatter), new];
  let hhmm = ns_string("HH:mm");
  let _: () = msg_send![fmt, setDateFormat: hhmm];

  let mut out: Vec<CalEvent> = Vec::new();
  for i in 0..n.min(30) {
    let ev: *mut AnyObject = msg_send![events, objectAtIndex: i];
    if ev.is_null() {
      continue;
    }
    let title_obj: *mut AnyObject = msg_send![ev, title];
    let start_obj: *mut AnyObject = msg_send![ev, startDate];
    let end_obj: *mut AnyObject = msg_send![ev, endDate];
    let id_obj: *mut AnyObject = msg_send![ev, eventIdentifier];
    let cal_obj: *mut AnyObject = msg_send![ev, calendar];
    let cal_title: *mut AnyObject = if cal_obj.is_null() {
      std::ptr::null_mut()
    } else {
      msg_send![cal_obj, title]
    };

    let start_str: *mut AnyObject = if start_obj.is_null() {
      std::ptr::null_mut()
    } else {
      msg_send![fmt, stringFromDate: start_obj]
    };
    let end_str: *mut AnyObject = if end_obj.is_null() {
      std::ptr::null_mut()
    } else {
      msg_send![fmt, stringFromDate: end_obj]
    };

    out.push(CalEvent {
      id: ns_to_string(id_obj),
      title: ns_to_string(title_obj),
      start: ns_to_string(start_str),
      end: ns_to_string(end_str),
      calendar: ns_to_string(cal_title),
    });
  }

  out
}
