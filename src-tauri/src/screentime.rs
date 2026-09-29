use serde::Serialize;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int, c_void};

#[derive(Serialize)]
pub struct ScreenTime {
  pub allowed: bool,
  pub milliseconds: Option<u64>,
}

/// Screen Time for today. `allowed` is false until this app can read the
/// system database, which macOS only permits with Full Disk Access.
#[tauri::command]
pub fn screen_time_today() -> ScreenTime {
  #[cfg(target_os = "macos")]
  {
    read_today()
  }
  #[cfg(not(target_os = "macos"))]
  {
    ScreenTime {
      allowed: false,
      milliseconds: None,
    }
  }
}

#[cfg(target_os = "macos")]
fn read_today() -> ScreenTime {
  let Some(home) = std::env::var("HOME").ok() else {
    return denied();
  };
  let db = format!("{home}/Library/Application Support/Knowledge/knowledgeC.db");
  if !std::path::Path::new(&db).exists() {
    return denied();
  }
  let Some(midnight) = local_midnight_unix() else {
    return denied();
  };
  let apple = midnight - 978_307_200;
  if apple < 0 {
    return denied();
  }
  match query_usage_seconds(&db, apple) {
    Ok(seconds) => ScreenTime {
      allowed: true,
      milliseconds: Some(seconds.saturating_mul(1000)),
    },
    Err(_) => denied(),
  }
}

#[cfg(target_os = "macos")]
fn denied() -> ScreenTime {
  ScreenTime {
    allowed: false,
    milliseconds: None,
  }
}

#[cfg(target_os = "macos")]
fn local_midnight_unix() -> Option<i64> {
  let out = std::process::Command::new("/bin/date")
    .args(["-v0H", "-v0M", "-v0S", "+%s"])
    .output()
    .ok()?;
  if !out.status.success() {
    return None;
  }
  String::from_utf8(out.stdout).ok()?.trim().parse().ok()
}

#[cfg(target_os = "macos")]
fn query_usage_seconds(path: &str, apple_start: i64) -> Result<u64, String> {
  const SQLITE_OPEN_READONLY: c_int = 1;
  const SQLITE_OK: c_int = 0;
  const SQLITE_ROW: c_int = 100;
  let sql = "SELECT CAST(COALESCE(SUM(ZENDDATE - ZSTARTDATE), 0) AS INTEGER) FROM ZOBJECT WHERE ZSTREAMNAME = '/app/usage' AND ZSTARTDATE >= ?1 AND ZENDDATE > ZSTARTDATE";
  unsafe {
    let c_path = CString::new(path).map_err(|e| e.to_string())?;
    let c_sql = CString::new(sql).map_err(|e| e.to_string())?;
    let mut db: *mut c_void = std::ptr::null_mut();
    let opened = sqlite3_open_v2(c_path.as_ptr(), &mut db, SQLITE_OPEN_READONLY, std::ptr::null());
    if opened != SQLITE_OK || db.is_null() {
      let message = sqlite_message(db);
      if !db.is_null() {
        sqlite3_close(db);
      }
      return Err(message);
    }
    sqlite3_busy_timeout(db, 1500);
    let mut stmt: *mut c_void = std::ptr::null_mut();
    let prepared = sqlite3_prepare_v2(db, c_sql.as_ptr(), -1, &mut stmt, std::ptr::null_mut());
    if prepared != SQLITE_OK || stmt.is_null() {
      let message = sqlite_message(db);
      sqlite3_close(db);
      return Err(message);
    }
    sqlite3_bind_int64(stmt, 1, apple_start);
    let stepped = sqlite3_step(stmt);
    let seconds = if stepped == SQLITE_ROW {
      sqlite3_column_int64(stmt, 0).max(0) as u64
    } else {
      0
    };
    let failed = stepped != SQLITE_ROW;
    sqlite3_finalize(stmt);
    let message = if failed { sqlite_message(db) } else { String::new() };
    sqlite3_close(db);
    if failed {
      return Err(if message.is_empty() { "screen time query failed".into() } else { message });
    }
    Ok(seconds)
  }
}

#[cfg(target_os = "macos")]
unsafe fn sqlite_message(db: *mut c_void) -> String {
  if db.is_null() {
    return "authorization denied".into();
  }
  let ptr = sqlite3_errmsg(db);
  if ptr.is_null() {
    return "authorization denied".into();
  }
  CStr::from_ptr(ptr).to_string_lossy().into_owned()
}

#[cfg(target_os = "macos")]
#[link(name = "sqlite3")]
extern "C" {
  fn sqlite3_open_v2(filename: *const c_char, db: *mut *mut c_void, flags: c_int, vfs: *const c_char) -> c_int;
  fn sqlite3_close(db: *mut c_void) -> c_int;
  fn sqlite3_prepare_v2(
    db: *mut c_void,
    sql: *const c_char,
    nbytes: c_int,
    stmt: *mut *mut c_void,
    tail: *mut *const c_char,
  ) -> c_int;
  fn sqlite3_bind_int64(stmt: *mut c_void, index: c_int, value: i64) -> c_int;
  fn sqlite3_step(stmt: *mut c_void) -> c_int;
  fn sqlite3_column_int64(stmt: *mut c_void, col: c_int) -> i64;
  fn sqlite3_finalize(stmt: *mut c_void) -> c_int;
  fn sqlite3_errmsg(db: *mut c_void) -> *const c_char;
  fn sqlite3_busy_timeout(db: *mut c_void, ms: c_int) -> c_int;
}
