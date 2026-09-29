/// macOS Screen Time keeps per-app foreground intervals in knowledgeC.db.
/// The clock is Apple's 2001 epoch. Returns milliseconds for local today, or
/// nothing when the database is missing or protected.
#[tauri::command]
pub fn screen_time_today() -> Option<u64> {
  #[cfg(target_os = "macos")]
  {
    let seconds = usage_seconds_today()?;
    Some(seconds.saturating_mul(1000))
  }
  #[cfg(not(target_os = "macos"))]
  {
    None
  }
}

#[cfg(target_os = "macos")]
fn usage_seconds_today() -> Option<u64> {
  let home = std::env::var("HOME").ok()?;
  let db = format!("{home}/Library/Application Support/Knowledge/knowledgeC.db");
  if !std::path::Path::new(&db).exists() {
    return None;
  }
  let midnight = local_midnight_unix()?;
  let apple = midnight - 978_307_200;
  if apple < 0 {
    return None;
  }
  let sql = format!(
    "SELECT CAST(COALESCE(SUM(ZENDDATE - ZSTARTDATE), 0) AS INTEGER) FROM ZOBJECT WHERE ZSTREAMNAME = '/app/usage' AND ZSTARTDATE >= {apple} AND ZENDDATE > ZSTARTDATE;"
  );
  let out = std::process::Command::new("/usr/bin/sqlite3")
    .arg("-readonly")
    .arg(&db)
    .arg(&sql)
    .output()
    .ok()?;
  if !out.status.success() {
    return None;
  }
  let text = String::from_utf8(out.stdout).ok()?;
  let seconds: u64 = text.trim().parse().ok()?;
  Some(seconds)
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
