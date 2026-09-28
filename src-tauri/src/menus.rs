use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub fn install(app: &tauri::App) -> tauri::Result<()> {
  let h = app.handle();
  let about = PredefinedMenuItem::about(
    h,
    Some("About Cove"),
    Some(AboutMetadata {
      name: Some("Cove".into()),
      version: Some(env!("CARGO_PKG_VERSION").into()),
      copyright: Some("Kept in the notch.".into()),
      ..Default::default()
    }),
  )?;
  let settings = MenuItem::with_id(h, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
  let quit = PredefinedMenuItem::quit(h, Some("Quit Cove"))?;
  let cove = Submenu::with_items(
    h,
    "Cove",
    true,
    &[&about, &settings, &PredefinedMenuItem::separator(h)?, &quit],
  )?;

  let export = MenuItem::with_id(h, "export", "Export backup…", true, None::<&str>)?;
  let import = MenuItem::with_id(h, "import", "Import backup…", true, None::<&str>)?;
  let file = Submenu::with_items(h, "File", true, &[&export, &import])?;

  let edit = Submenu::with_items(
    h,
    "Edit",
    true,
    &[
      &PredefinedMenuItem::cut(h, None)?,
      &PredefinedMenuItem::copy(h, None)?,
      &PredefinedMenuItem::paste(h, None)?,
      &PredefinedMenuItem::separator(h)?,
      &PredefinedMenuItem::select_all(h, None)?,
    ],
  )?;

  let horizontal = MenuItem::with_id(h, "layout-horizontal", "Wide notch", true, None::<&str>)?;
  let vertical = MenuItem::with_id(h, "layout-vertical", "Tall notch", true, None::<&str>)?;
  let timer = MenuItem::with_id(h, "toggle-timer", "Focus timer in the notch", true, None::<&str>)?;
  let rings = MenuItem::with_id(h, "toggle-rings", "Agent rings", true, None::<&str>)?;
  let hover = MenuItem::with_id(h, "toggle-hover", "Open when the pointer rests", true, None::<&str>)?;
  let view = Submenu::with_items(
    h,
    "View",
    true,
    &[
      &horizontal,
      &vertical,
      &PredefinedMenuItem::separator(h)?,
      &timer,
      &rings,
      &hover,
    ],
  )?;

  let menu = Menu::with_items(h, &[&cove, &file, &edit, &view])?;
  app.set_menu(menu)?;
  app.on_menu_event(|app, event| {
    let id = event.id().as_ref();
    if id == "settings" {
      open_settings(app);
    } else {
      let _ = app.emit("cove-menu", id);
    }
  });
  Ok(())
}

pub fn open_settings(app: &tauri::AppHandle) {
  #[cfg(target_os = "macos")]
  let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);

  if let Some(win) = app.get_webview_window("settings") {
    reveal(&win);
    return;
  }
  match WebviewWindowBuilder::new(app, "settings", WebviewUrl::default())
    .title("Settings")
    .inner_size(560.0, 720.0)
    .min_inner_size(480.0, 560.0)
    .resizable(true)
    .center()
    .focused(true)
    .visible(true)
    .decorations(true)
    .transparent(false)
    .always_on_top(true)
    .initialization_script("window.__COVE_WINDOW__='settings'")
    .build()
  {
    Ok(win) => reveal(&win),
    Err(err) => {
      eprintln!("cove settings: {err}");
      let _ = app.emit("cove-menu", "settings-inline");
    }
  }
}

fn reveal(win: &tauri::WebviewWindow) {
  let _ = win.show();
  let _ = win.unminimize();
  let _ = win.set_focus();
  #[cfg(target_os = "macos")]
  unsafe {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    if let Ok(ptr) = win.ns_window() {
      let ns = ptr as *mut AnyObject;
      let _: () = msg_send![ns, setLevel: 1001isize];
      let _: bool = msg_send![ns, makeKeyAndOrderFront: std::ptr::null_mut::<AnyObject>()];
    }
    let app: *mut AnyObject = msg_send![objc2::class!(NSApplication), sharedApplication];
    let _: () = msg_send![app, activateIgnoringOtherApps: true];
  }
}
