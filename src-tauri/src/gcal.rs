use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, Duration as ChronoDuration, Local, NaiveTime, TimeZone};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, Instant};

use crate::calendar::CalEvent;

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const SCOPE: &str = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email";

#[derive(Serialize, Clone)]
pub struct GoogleStatus {
  pub connected: bool,
  pub configured: bool,
  pub email: String,
}

#[derive(Serialize)]
pub struct GoogleSnapshot {
  pub connected: bool,
  pub configured: bool,
  pub email: String,
  pub error: Option<String>,
  pub events: Vec<CalEvent>,
}

#[derive(Serialize, Deserialize, Default, Clone)]
struct GoogleAuth {
  client_id: String,
  client_secret: String,
  refresh_token: String,
  email: String,
}

#[derive(Deserialize)]
struct InstalledClient {
  client_id: String,
  client_secret: String,
}

#[derive(Deserialize)]
struct ClientFile {
  installed: InstalledClient,
}

#[derive(Deserialize)]
struct TokenResponse {
  access_token: Option<String>,
  refresh_token: Option<String>,
  error: Option<String>,
  error_description: Option<String>,
}

#[derive(Deserialize)]
struct UserInfo {
  email: Option<String>,
}

#[derive(Deserialize, Default)]
struct CalendarList {
  items: Vec<CalendarItem>,
}

#[derive(Deserialize, Default)]
struct CalendarItem {
  id: String,
  summary: Option<String>,
  #[serde(default)]
  selected: Option<bool>,
  #[serde(default)]
  primary: Option<bool>,
}

#[derive(Deserialize, Default)]
struct EventList {
  items: Option<Vec<GEvent>>,
}

#[derive(Deserialize, Default)]
struct GEvent {
  id: Option<String>,
  summary: Option<String>,
  status: Option<String>,
  start: Option<GWhen>,
  end: Option<GWhen>,
}

#[derive(Deserialize, Default)]
struct GWhen {
  #[serde(rename = "dateTime")]
  date_time: Option<String>,
  date: Option<String>,
}

#[tauri::command]
pub fn google_calendar_status() -> GoogleStatus {
  with_bundled(load_auth()).map(|auth| status_from(&auth)).unwrap_or(GoogleStatus {
    connected: false,
    configured: false,
    email: String::new(),
  })
}

#[tauri::command]
pub fn google_calendar_configure(client_id: String, client_secret: String) -> Result<GoogleStatus, String> {
  let client_id = client_id.trim().to_string();
  let client_secret = client_secret.trim().to_string();
  if !valid_client_id(&client_id) {
    return Err("That client ID should end in .apps.googleusercontent.com".into());
  }
  if client_secret.is_empty() {
    return Err("Google desktop clients also need the client secret".into());
  }
  let mut auth = load_auth();
  if auth.client_id != client_id {
    auth.refresh_token.clear();
    auth.email.clear();
  }
  auth.client_id = client_id;
  auth.client_secret = client_secret;
  save_auth(&auth)?;
  Ok(status_from(&auth))
}

#[tauri::command]
pub fn google_calendar_connect() -> Result<GoogleSnapshot, String> {
  let auth = with_bundled(load_auth())?;
  if !valid_client_id(&auth.client_id) || auth.client_secret.is_empty() {
    return Err("Google sign-in is not configured in this build".into());
  }
  let (code, redirect, verifier) = browser_grant(&auth.client_id)?;
  let mut tokens = exchange_code(&auth, &code, &redirect, &verifier)?;
  if tokens.refresh_token.is_none() && !auth.refresh_token.is_empty() {
    tokens.refresh_token = Some(auth.refresh_token.clone());
  }
  let refresh = tokens
    .refresh_token
    .clone()
    .ok_or("Google did not return a refresh token. Remove Alt-AK access in the Google account page and connect again.")?;
  let access = tokens.access_token.clone().ok_or("Google did not return an access token")?;
  let email = user_email(&access).unwrap_or_default();
  let stored = GoogleAuth {
    client_id: auth.client_id,
    client_secret: auth.client_secret,
    refresh_token: refresh,
    email,
  };
  save_auth(&stored)?;
  match fetch_events(&access) {
    Ok(events) => Ok(snapshot(&stored, None, events)),
    Err(error) => Ok(snapshot(&stored, Some(error), Vec::new())),
  }
}

#[tauri::command]
pub fn google_calendar_disconnect() -> Result<GoogleStatus, String> {
  let mut auth = with_bundled(load_auth())?;
  auth.refresh_token.clear();
  auth.email.clear();
  save_auth(&auth)?;
  Ok(status_from(&auth))
}

#[tauri::command]
pub fn google_calendar_events() -> GoogleSnapshot {
  let Ok(auth) = with_bundled(load_auth()) else {
    return GoogleSnapshot {
      connected: false,
      configured: false,
      email: String::new(),
      error: Some("Google sign-in is not configured in this build".into()),
      events: Vec::new(),
    };
  };
  if auth.refresh_token.is_empty() {
    return snapshot(&auth, None, Vec::new());
  }
  match access_token(&auth) {
    Ok(access) => match fetch_events(&access) {
      Ok(events) => snapshot(&auth, None, events),
      Err(error) => snapshot(&auth, Some(error), Vec::new()),
    },
    Err(error) => snapshot(&auth, Some(error), Vec::new()),
  }
}

fn with_bundled(mut auth: GoogleAuth) -> Result<GoogleAuth, String> {
  let file: ClientFile = serde_json::from_str(include_str!("../google-oauth.json"))
    .map_err(|_| "Google sign-in is not configured in this build".to_string())?;
  let id = file.installed.client_id.trim().to_string();
  let secret = file.installed.client_secret.trim().to_string();
  if !valid_client_id(&id) || secret.is_empty() {
    return Err("Google sign-in is not configured in this build".into());
  }
  if !auth.client_id.is_empty() && auth.client_id != id {
    auth.refresh_token.clear();
    auth.email.clear();
  }
  auth.client_id = id;
  auth.client_secret = secret;
  Ok(auth)
}

fn status_from(auth: &GoogleAuth) -> GoogleStatus {
  GoogleStatus {
    connected: !auth.refresh_token.is_empty(),
    configured: valid_client_id(&auth.client_id) && !auth.client_secret.is_empty(),
    email: auth.email.clone(),
  }
}

fn snapshot(auth: &GoogleAuth, error: Option<String>, events: Vec<CalEvent>) -> GoogleSnapshot {
  let status = status_from(auth);
  GoogleSnapshot {
    connected: status.connected,
    configured: status.configured,
    email: status.email,
    error,
    events,
  }
}

fn valid_client_id(id: &str) -> bool {
  let id = id.trim();
  id.ends_with(".apps.googleusercontent.com")
    && id.len() > ".apps.googleusercontent.com".len() + 8
    && !id.chars().any(char::is_whitespace)
}

fn browser_grant(client_id: &str) -> Result<(String, String, String), String> {
  let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("Could not open a local sign-in port: {e}"))?;
  listener.set_nonblocking(true).map_err(|e| e.to_string())?;
  let port = listener.local_addr().map_err(|e| e.to_string())?.port();
  let redirect = format!("http://127.0.0.1:{port}");
  let (verifier, challenge) = pkce();
  let state = URL_SAFE_NO_PAD.encode(random_bytes(24));
  let url = format!(
    "{AUTH_URL}?{}",
    form_pairs(&[
      ("client_id", client_id),
      ("redirect_uri", &redirect),
      ("response_type", "code"),
      ("scope", SCOPE),
      ("code_challenge", &challenge),
      ("code_challenge_method", "S256"),
      ("access_type", "offline"),
      ("prompt", "consent"),
      ("state", &state),
    ])
  );
  std::process::Command::new("open")
    .arg(&url)
    .spawn()
    .map_err(|e| format!("Could not open the browser: {e}"))?;

  let start = Instant::now();
  let mut stream = loop {
    match listener.accept() {
      Ok((stream, _)) => break stream,
      Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
        if start.elapsed() > Duration::from_secs(180) {
          return Err("Google sign-in timed out. Try Connect again.".into());
        }
        thread::sleep(Duration::from_millis(40));
      }
      Err(err) => return Err(err.to_string()),
    }
  };
  stream.set_read_timeout(Some(Duration::from_secs(8))).ok();
  let mut buf = [0u8; 8192];
  let n = stream.read(&mut buf).unwrap_or(0);
  let req = String::from_utf8_lossy(&buf[..n]);
  let target = req.split_whitespace().nth(1).unwrap_or("");
  let (code, got_state) = parse_redirect(target)?;
  if got_state != state {
    let _ = write_page(&mut stream, "Sign-in did not match this app. Close this window and try again.");
    return Err("Google sign-in did not match this app. Try again.".into());
  }
  let _ = write_page(&mut stream, "Google Calendar is connected. You can close this window.");
  Ok((code, redirect, verifier))
}

fn write_page(stream: &mut impl Write, message: &str) -> std::io::Result<()> {
  let body = format!(
    "<!doctype html><meta charset=\"utf-8\"><title>Alt-AK</title><body style=\"font-family:-apple-system,sans-serif;padding:48px;color:#241f18\"><p>{message}</p></body>"
  );
  write!(
    stream,
    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
    body.len()
  )?;
  stream.flush()
}

fn exchange_code(auth: &GoogleAuth, code: &str, redirect: &str, verifier: &str) -> Result<TokenResponse, String> {
  let body = form_pairs(&[
    ("code", code),
    ("client_id", &auth.client_id),
    ("client_secret", &auth.client_secret),
    ("redirect_uri", redirect),
    ("grant_type", "authorization_code"),
    ("code_verifier", verifier),
  ]);
  post_token(&body)
}

fn access_token(auth: &GoogleAuth) -> Result<String, String> {
  let body = form_pairs(&[
    ("client_id", &auth.client_id),
    ("client_secret", &auth.client_secret),
    ("refresh_token", &auth.refresh_token),
    ("grant_type", "refresh_token"),
  ]);
  let tokens = post_token(&body)?;
  tokens.access_token.ok_or_else(|| "Google did not refresh the sign-in".into())
}

fn post_token(body: &str) -> Result<TokenResponse, String> {
  let response = ureq::post(TOKEN_URL)
    .timeout(Duration::from_secs(20))
    .set("Content-Type", "application/x-www-form-urlencoded")
    .set("User-Agent", "Alt-AK/0.1")
    .send_string(body)
    .map_err(http_error)?;
  let tokens: TokenResponse = response.into_json().map_err(|e| e.to_string())?;
  if let Some(error) = tokens.error.clone() {
    let detail = tokens.error_description.unwrap_or(error);
    return Err(detail);
  }
  Ok(tokens)
}

fn user_email(access: &str) -> Option<String> {
  let info: UserInfo = ureq::get("https://www.googleapis.com/oauth2/v2/userinfo")
    .timeout(Duration::from_secs(15))
    .set("Authorization", &format!("Bearer {access}"))
    .set("User-Agent", "Alt-AK/0.1")
    .call()
    .ok()?
    .into_json()
    .ok()?;
  info.email.filter(|email| !email.is_empty())
}

fn fetch_events(access: &str) -> Result<Vec<CalEvent>, String> {
  let (time_min, time_max) = window();
  let list = ureq::get("https://www.googleapis.com/calendar/v3/users/me/calendarList")
    .timeout(Duration::from_secs(20))
    .set("Authorization", &format!("Bearer {access}"))
    .set("User-Agent", "Alt-AK/0.1")
    .query("minAccessRole", "reader")
    .call()
    .map_err(http_error)?
    .into_json::<CalendarList>()
    .map_err(|e| e.to_string())?;

  let mut calendars: Vec<CalendarItem> = list
    .items
    .into_iter()
    .filter(|cal| cal.selected.unwrap_or(true) && !cal.id.is_empty())
    .collect();
  calendars.sort_by_key(|cal| !cal.primary.unwrap_or(false));
  calendars.truncate(8);

  let mut events = Vec::new();
  for cal in calendars {
    let name = cal.summary.clone().unwrap_or_else(|| "Google".into());
    let page = ureq::get(&format!(
      "https://www.googleapis.com/calendar/v3/calendars/{}/events",
      form_encode(&cal.id)
    ))
    .timeout(Duration::from_secs(20))
    .set("Authorization", &format!("Bearer {access}"))
    .set("User-Agent", "Alt-AK/0.1")
    .query("timeMin", &time_min)
    .query("timeMax", &time_max)
    .query("singleEvents", "true")
    .query("orderBy", "startTime")
    .query("maxResults", "15")
    .call()
    .map_err(http_error)?
    .into_json::<EventList>()
    .map_err(|e| e.to_string())?;
    for event in page.items.unwrap_or_default() {
      if event.status.as_deref() == Some("cancelled") {
        continue;
      }
      let Some(title) = event.summary.filter(|s| !s.trim().is_empty()) else {
        continue;
      };
      let (start, end, sort) = format_span(event.start.as_ref(), event.end.as_ref());
      if start.is_empty() {
        continue;
      }
      events.push((
        sort,
        CalEvent {
          id: event.id.unwrap_or_else(|| format!("{}:{title}", cal.id)),
          title,
          start,
          end,
          calendar: name.clone(),
        },
      ));
    }
  }
  events.sort_by(|a, b| a.0.cmp(&b.0));
  Ok(events.into_iter().take(30).map(|(_, event)| event).collect())
}

fn window() -> (String, String) {
  let now = Local::now();
  let start = Local
    .from_local_datetime(
      &now
        .date_naive()
        .and_time(NaiveTime::from_hms_opt(0, 0, 0).unwrap_or_default()),
    )
    .single()
    .unwrap_or(now);
  let end = start + ChronoDuration::days(2);
  (start.to_rfc3339(), end.to_rfc3339())
}

fn format_span(start: Option<&GWhen>, end: Option<&GWhen>) -> (String, String, String) {
  let Some(start) = start else {
    return (String::new(), String::new(), String::new());
  };
  if let Some(date) = start.date.as_deref() {
    return ("All day".into(), String::new(), format!("{date}T00:00:00"));
  }
  let Some(raw) = start.date_time.as_deref() else {
    return (String::new(), String::new(), String::new());
  };
  let Ok(parsed) = DateTime::parse_from_rfc3339(raw) else {
    return (String::new(), String::new(), raw.to_string());
  };
  let local = parsed.with_timezone(&Local);
  let end_label = end
    .and_then(|when| when.date_time.as_deref())
    .and_then(|raw| DateTime::parse_from_rfc3339(raw).ok())
    .map(|parsed| parsed.with_timezone(&Local).format("%H:%M").to_string())
    .unwrap_or_default();
  (local.format("%H:%M").to_string(), end_label, local.to_rfc3339())
}

fn http_error(err: ureq::Error) -> String {
  match err {
    ureq::Error::Status(code, response) => {
      let body = response.into_string().unwrap_or_default();
      let body = body.replace('\n', " ");
      let body: String = body.chars().take(180).collect();
      if body.is_empty() {
        format!("Google returned {code}")
      } else {
        format!("Google returned {code}: {body}")
      }
    }
    other => other.to_string(),
  }
}

fn auth_path() -> Result<PathBuf, String> {
  let home = std::env::var("HOME").map_err(|_| "Could not find the home folder".to_string())?;
  let dir = PathBuf::from(home).join("Library/Application Support/com.cove.kept");
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir.join("google-calendar.json"))
}

fn load_auth() -> GoogleAuth {
  let Ok(path) = auth_path() else {
    return GoogleAuth::default();
  };
  let Ok(raw) = std::fs::read_to_string(path) else {
    return GoogleAuth::default();
  };
  serde_json::from_str(&raw).unwrap_or_default()
}

fn save_auth(auth: &GoogleAuth) -> Result<(), String> {
  let path = auth_path()?;
  let json = serde_json::to_string(auth).map_err(|e| e.to_string())?;
  let mut file = {
    #[cfg(unix)]
    {
      use std::os::unix::fs::OpenOptionsExt;
      OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(&path)
        .map_err(|e| e.to_string())?
    }
    #[cfg(not(unix))]
    {
      OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&path)
        .map_err(|e| e.to_string())?
    }
  };
  file.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
  Ok(())
}

fn pkce() -> (String, String) {
  let verifier = URL_SAFE_NO_PAD.encode(random_bytes(32));
  let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
  (verifier, challenge)
}

fn random_bytes(n: usize) -> Vec<u8> {
  let mut buf = vec![0u8; n];
  if let Ok(mut file) = std::fs::File::open("/dev/urandom") {
    let _ = file.read_exact(&mut buf);
  }
  buf
}

fn form_pairs(pairs: &[(&str, &str)]) -> String {
  pairs
    .iter()
    .map(|(key, value)| format!("{}={}", form_encode(key), form_encode(value)))
    .collect::<Vec<_>>()
    .join("&")
}

fn form_encode(value: &str) -> String {
  let mut out = String::new();
  for byte in value.bytes() {
    match byte {
      b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(byte as char),
      _ => out.push_str(&format!("%{byte:02X}")),
    }
  }
  out
}

fn percent_decode(value: &str) -> String {
  let bytes = value.as_bytes();
  let mut out = Vec::new();
  let mut i = 0;
  while i < bytes.len() {
    if bytes[i] == b'%' && i + 2 < bytes.len() {
      if let Ok(byte) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16) {
        out.push(byte);
        i += 3;
        continue;
      }
    }
    if bytes[i] == b'+' {
      out.push(b' ');
    } else {
      out.push(bytes[i]);
    }
    i += 1;
  }
  String::from_utf8(out).unwrap_or_else(|_| value.to_string())
}

fn parse_redirect(target: &str) -> Result<(String, String), String> {
  let query = target.split_once('?').map(|(_, query)| query).unwrap_or("");
  let query = query.split_whitespace().next().unwrap_or("");
  let mut code = None;
  let mut state = None;
  let mut error = None;
  for pair in query.split('&').filter(|pair| !pair.is_empty()) {
    let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
    let value = percent_decode(value);
    match key {
      "code" => code = Some(value),
      "state" => state = Some(value),
      "error" => error = Some(value),
      _ => {}
    }
  }
  if let Some(error) = error {
    if error == "access_denied" {
      return Err("Google sign-in was cancelled".into());
    }
    return Err(error);
  }
  Ok((
    code.ok_or("Google did not return a sign-in code")?,
    state.unwrap_or_default(),
  ))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn reads_the_sign_in_code() {
    let (code, state) = parse_redirect("/?code=abc%2F1&state=xyz").unwrap();
    assert_eq!(code, "abc/1");
    assert_eq!(state, "xyz");
  }

  #[test]
  fn cancelled_sign_in_is_an_error() {
    let err = parse_redirect("/?error=access_denied").unwrap_err();
    assert!(err.contains("cancelled"));
  }

  #[test]
  fn client_id_must_look_like_google() {
    assert!(!valid_client_id("not-a-client"));
    assert!(valid_client_id("1234567890-abc.apps.googleusercontent.com"));
  }

  #[test]
  fn encodes_the_form_body() {
    assert_eq!(form_encode("a b"), "a%20b");
    assert!(form_pairs(&[("scope", "a b")]).contains("scope=a%20b"));
  }

  #[test]
  fn formats_a_timed_event_in_local_time() {
    let start = GWhen {
      date_time: Some("2026-09-29T04:30:00Z".into()),
      date: None,
    };
    let end = GWhen {
      date_time: Some("2026-09-29T05:00:00Z".into()),
      date: None,
    };
    let (label, end_label, _) = format_span(Some(&start), Some(&end));
    assert_eq!(label.len(), 5);
    assert!(label.contains(':'));
    assert_eq!(end_label.len(), 5);
  }

  #[test]
  fn formats_an_all_day_event() {
    let start = GWhen {
      date_time: None,
      date: Some("2026-09-29".into()),
    };
    let (label, end_label, sort) = format_span(Some(&start), None);
    assert_eq!(label, "All day");
    assert!(end_label.is_empty());
    assert!(sort.starts_with("2026-09-29"));
  }
}
