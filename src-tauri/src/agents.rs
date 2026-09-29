use serde::Serialize;
use serde_json::Value;
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Clone, Serialize)]
pub struct AgentStatus {
  pub id: String,
  pub label: String,
  pub running: bool,
  pub percent: Option<f64>,
  pub detail: String,
  pub color: String,
  pub resets_at: Option<String>,
  pub resets_ms: Option<i64>,
  pub threads: u32,
}

#[derive(Clone)]
struct Cache {
  at: Instant,
  claude_percent: Option<f64>,
  claude_detail: String,
  claude_resets: Option<String>,
  cursor_percent: Option<f64>,
  cursor_detail: String,
  cursor_resets_ms: Option<i64>,
}

static CACHE: Mutex<Option<Cache>> = Mutex::new(None);

fn home() -> Option<String> {
  std::env::var("HOME").ok()
}

fn keychain(service: &str) -> Option<String> {
  let out = Command::new("/usr/bin/security")
    .args(["find-generic-password", "-s", service, "-w"])
    .output()
    .ok()?;
  if !out.status.success() {
    return None;
  }
  let raw = String::from_utf8(out.stdout).ok()?;
  let raw = raw.trim();
  if raw.is_empty() {
    return None;
  }
  if let Ok(v) = serde_json::from_str::<Value>(raw) {
    v.pointer("/claudeAiOauth/accessToken")
      .or_else(|| v.get("accessToken"))
      .or_else(|| v.pointer("/access_token"))
      .and_then(|x| x.as_str())
      .map(|s| s.to_string())
      .or_else(|| {
        if raw.starts_with("sk-") {
          Some(raw.to_string())
        } else {
          None
        }
      })
  } else if raw.starts_with("sk-") || raw.starts_with("eyJ") {
    Some(raw.to_string())
  } else {
    None
  }
}

fn sqlite_value(db: &str, key: &str) -> Option<String> {
  let out = Command::new("/usr/bin/sqlite3")
    .args([db, &format!("SELECT value FROM ItemTable WHERE key='{key}' LIMIT 1;")])
    .output()
    .ok()?;
  if !out.status.success() {
    return None;
  }
  let s = String::from_utf8(out.stdout).ok()?;
  let s = s.trim().trim_matches('"').to_string();
  if s.is_empty() {
    None
  } else {
    Some(s)
  }
}

fn http_json(method: &str, url: &str, token: &str, extra: &[(&str, &str)], body: Option<&str>) -> Option<Value> {
  let mut req = if method == "POST" {
    ureq::post(url)
  } else {
    ureq::get(url)
  };
  req = req
    .timeout(Duration::from_secs(5))
    .set("Authorization", &format!("Bearer {token}"))
    .set("User-Agent", "ClimateStudioSpecialPackage/0.1");
  for (k, v) in extra {
    req = req.set(k, v);
  }
  let resp = if method == "POST" {
    req.set("Content-Type", "application/json").send_string(body.unwrap_or("{}"))
  } else {
    req.call()
  }
  .ok()?;
  resp.into_json().ok()
}

fn until_label(resets_at: Option<&str>, resets_ms: Option<i64>) -> String {
  let ms = resets_ms.or_else(|| {
    resets_at.and_then(|s| {
      // RFC3339-ish: 2026-09-28T14:50:00...
      let z = s.replace('Z', "+00:00");
      let head = z.split('.').next().unwrap_or(&z);
      let core = head.split('+').next().unwrap_or(head).trim_end_matches('Z');
      let parts: Vec<&str> = core.split('T').collect();
      if parts.len() != 2 {
        return None;
      }
      let d: Vec<&str> = parts[0].split('-').collect();
      let t: Vec<&str> = parts[1].split(':').collect();
      if d.len() != 3 || t.len() < 2 {
        return None;
      }
      let y: i32 = d[0].parse().ok()?;
      let mo: u32 = d[1].parse().ok()?;
      let day: u32 = d[2].parse().ok()?;
      let h: u32 = t[0].parse().ok()?;
      let mi: u32 = t[1].parse().ok()?;
      let se: u32 = t.get(2).and_then(|x| x.parse().ok()).unwrap_or(0);
      civil_to_unix_ms(y, mo, day, h, mi, se)
    })
  });
  let Some(end) = ms else {
    return String::new();
  };
  let now = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as i64)
    .unwrap_or(0);
  let left = end - now;
  if left <= 0 {
    return "resetting".into();
  }
  let mins = left / 60_000;
  let h = mins / 60;
  let m = mins % 60;
  if h >= 24 {
    format!("{}d", h / 24)
  } else if h > 0 {
    format!("{h}h {m}m")
  } else {
    format!("{m}m")
  }
}

fn civil_to_unix_ms(y: i32, mo: u32, d: u32, h: u32, mi: u32, se: u32) -> Option<i64> {
  if mo == 0 || mo > 12 || d == 0 {
    return None;
  }
  let mut ymd = y as i64 * 365 + ((y as i64 - 1) / 4) - ((y as i64 - 1) / 100) + ((y as i64 - 1) / 400);
  let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
  let md = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  ymd += md[mo as usize - 1] as i64 + d as i64 - 1;
  if leap && mo > 2 {
    ymd += 1;
  }
  // days since 1970-01-01 (ymd epoch day of 1970-01-01 = 719162)
  let days = ymd - 719_162;
  Some((days * 86400 + h as i64 * 3600 + mi as i64 * 60 + se as i64) * 1000)
}

fn window_percent(v: &Value, key: &str) -> (Option<f64>, String, Option<String>) {
  let w = v.get(key);
  let pct = w.and_then(|x| x.get("utilization")).and_then(|x| x.as_f64());
  let resets = w
    .and_then(|x| x.get("resets_at"))
    .and_then(|x| x.as_str())
    .map(|s| s.to_string());
  let wait = until_label(resets.as_deref(), None);
  let detail = match (pct, wait.as_str()) {
    (Some(p), "") => format!("{:.0}%", p),
    (Some(p), t) => format!("{:.0}% · {t}", p),
    (None, "") => "—".into(),
    (None, t) => t.into(),
  };
  (pct, detail, resets)
}

fn claude_usage() -> (Option<f64>, String, Option<String>) {
  let token = keychain("Claude Code-credentials")
    .or_else(|| keychain("Claude Code-credentials-3aeaddee"));
  let Some(token) = token else {
    return (None, "sign in".into(), None);
  };
  let Some(v) = http_json(
    "GET",
    "https://api.anthropic.com/api/oauth/usage",
    &token,
    &[("anthropic-beta", "oauth-2025-04-20"), ("Content-Type", "application/json")],
    None,
  ) else {
    return (None, "offline".into(), None);
  };
  window_percent(&v, "five_hour")
}

fn cursor_usage() -> (Option<f64>, String, Option<i64>) {
  let home = match home() {
    Some(h) => h,
    None => return (None, "—".into(), None),
  };
  let db = format!("{home}/Library/Application Support/Cursor/User/globalStorage/state.vscdb");
  let token = match sqlite_value(&db, "cursorAuth/accessToken") {
    Some(t) => t,
    None => return (None, "sign in".into(), None),
  };
  let plan = sqlite_value(&db, "cursorAuth/stripeMembershipType").unwrap_or_else(|| "Cursor".into());
  let Some(v) = http_json(
    "POST",
    "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage",
    &token,
    &[],
    Some("{}"),
  ) else {
    return (None, plan, None);
  };
  let usage = v.get("planUsage");
  let pct = usage
    .and_then(|x| x.get("totalPercentUsed").or_else(|| x.get("autoPercentUsed")))
    .and_then(|x| x.as_f64());
  let end = v
    .get("billingCycleEnd")
    .and_then(|x| x.as_str().and_then(|s| s.parse::<i64>().ok()).or_else(|| x.as_i64()));
  let wait = until_label(None, end);
  let detail = match (pct, wait.as_str()) {
    (Some(p), "") => format!("{plan} · {:.0}%", p),
    (Some(p), t) => format!("{plan} · {:.0}% · {t}", p),
    (None, _) => plan,
  };
  (pct, detail, end)
}

fn recent_activity(dir: &str, seconds: u64, extra: &[&str]) -> bool {
  count_recent(dir, seconds, extra) > 0
}

fn count_recent(dir: &str, seconds: u64, extra: &[&str]) -> u32 {
  if !std::path::Path::new(dir).exists() {
    return 0;
  }
  let mut args = vec![dir.to_string()];
  args.extend(extra.iter().map(|s| s.to_string()));
  args.extend(["-newermt".into(), format!("{seconds} seconds ago")]);
  Command::new("/usr/bin/find")
    .args(&args)
    .output()
    .ok()
    .map(|o| {
      String::from_utf8_lossy(&o.stdout)
        .lines()
        .filter(|l| !l.trim().is_empty())
        .count() as u32
    })
    .unwrap_or(0)
}

fn ps_args() -> String {
  Command::new("/bin/ps")
    .args(["-axo", "args="])
    .output()
    .ok()
    .and_then(|o| String::from_utf8(o.stdout).ok())
    .unwrap_or_default()
}

fn claude_busy(ps: &str) -> bool {
  let live = ps.lines().any(|line| {
    let l = line.to_lowercase();
    let first = l.split_whitespace().next().unwrap_or("");
    let is_cli = first == "claude" || first.ends_with("/claude") || l.contains("caskroom/claude-code");
    if !is_cli {
      return false;
    }
    if l.contains("daemon") || l.contains("--bg-") || l.contains("cove") || l.contains("pgrep") {
      return false;
    }
    if l.contains("claude.app") || l.contains("claude helper") {
      return false;
    }
    true
  });
  if live {
    return true;
  }
  home()
    .map(|h| recent_activity(&format!("{h}/.claude/projects"), 90, &["-name", "*.jsonl"]))
    .unwrap_or(false)
}

fn cursor_busy(ps: &str) -> bool {
  let agent = ps.lines().any(|line| {
    let l = line.to_lowercase();
    (l.contains("cursor-agent") || l.contains("anysphere.cursor-agent"))
      && !l.contains("pgrep")
      && !l.contains("cove")
  });
  if agent {
    return true;
  }
  home()
    .map(|h| recent_activity(&format!("{h}/.cursor/projects"), 90, &["-path", "*agent-transcripts*"]))
    .unwrap_or(false)
}

fn claude_threads() -> u32 {
  home()
    .map(|h| count_recent(&format!("{h}/.claude/projects"), 6 * 3600, &["-name", "*.jsonl"]))
    .unwrap_or(0)
}

fn cursor_threads() -> u32 {
  home()
    .map(|h| count_recent(&format!("{h}/.cursor/projects"), 6 * 3600, &["-path", "*agent-transcripts*", "-type", "f"]))
    .unwrap_or(0)
}

fn codex_threads() -> u32 {
  home()
    .map(|h| count_recent(&format!("{h}/.codex/sessions"), 6 * 3600, &["-type", "f"]))
    .unwrap_or(0)
}

fn codex_busy(ps: &str) -> bool {
  let live = ps.lines().any(|line| {
    let l = line.to_lowercase();
    let name = l.split_whitespace().next().unwrap_or("");
    (name == "codex" || l.contains("/codex ") || l.ends_with("/codex"))
      && !l.contains("pgrep")
      && !l.contains("cove")
      && !l.contains("plugins/cache")
  });
  live
    || home()
      .map(|h| recent_activity(&format!("{h}/.codex/sessions"), 90, &["-type", "f"]))
      .unwrap_or(false)
}

#[tauri::command]
pub fn ai_agents() -> Vec<AgentStatus> {
  let ps = ps_args();
  let claude_run = claude_busy(&ps);
  let cursor_run = cursor_busy(&ps);
  let codex_run = codex_busy(&ps);
  let claude_n = claude_threads();
  let cursor_n = cursor_threads();
  let codex_n = codex_threads();

  let mut claude_percent = None;
  let mut claude_detail = if claude_run { "busy".into() } else { "idle".into() };
  let mut claude_resets = None;
  let mut cursor_percent = None;
  let mut cursor_detail = if cursor_run { "busy".into() } else { "idle".into() };
  let mut cursor_resets_ms = None;

  let cached = CACHE.lock().ok().and_then(|g| g.as_ref().map(|c| (c.at, c.clone())));
  let use_cache = cached
    .as_ref()
    .map(|(at, _)| at.elapsed() < Duration::from_secs(45))
    .unwrap_or(false);

  if use_cache {
    if let Some((_, c)) = cached {
      claude_percent = c.claude_percent;
      claude_detail = c.claude_detail;
      claude_resets = c.claude_resets;
      cursor_percent = c.cursor_percent;
      cursor_detail = c.cursor_detail;
      cursor_resets_ms = c.cursor_resets_ms;
    }
  } else {
    let (p, d, r) = claude_usage();
    claude_percent = p;
    claude_detail = d;
    claude_resets = r;
    let (p, d, r) = cursor_usage();
    cursor_percent = p;
    cursor_detail = d;
    cursor_resets_ms = r;
    if let Ok(mut g) = CACHE.lock() {
      *g = Some(Cache {
        at: Instant::now(),
        claude_percent,
        claude_detail: claude_detail.clone(),
        claude_resets: claude_resets.clone(),
        cursor_percent,
        cursor_detail: cursor_detail.clone(),
        cursor_resets_ms,
      });
    }
  }

  vec![
    AgentStatus {
      id: "claude".into(),
      label: "Claude".into(),
      running: claude_run,
      percent: claude_percent,
      detail: claude_detail,
      color: "#d97757".into(),
      resets_at: claude_resets,
      resets_ms: None,
      threads: claude_n,
    },
    AgentStatus {
      id: "cursor".into(),
      label: "Cursor".into(),
      running: cursor_run,
      percent: cursor_percent,
      detail: cursor_detail,
      color: "#7c7cff".into(),
      resets_at: None,
      resets_ms: cursor_resets_ms,
      threads: cursor_n,
    },
    AgentStatus {
      id: "codex".into(),
      label: "Codex".into(),
      running: codex_run,
      percent: None,
      detail: if codex_run { "busy".into() } else { "idle".into() },
      color: "#34d399".into(),
      resets_at: None,
      resets_ms: None,
      threads: codex_n,
    },
  ]
}
