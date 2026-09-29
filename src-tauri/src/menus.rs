use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};

pub fn install(app: &tauri::App) -> tauri::Result<()> {
  let h = app.handle();
  let about = PredefinedMenuItem::about(
    h,
    Some("About Alt-AK"),
    Some(AboutMetadata {
      name: Some("Alt-AK".into()),
      version: Some(env!("CARGO_PKG_VERSION").into()),
      copyright: Some("Kept in the notch.".into()),
      ..Default::default()
    }),
  )?;
  let settings = MenuItem::with_id(h, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
  let quit = PredefinedMenuItem::quit(h, Some("Quit Alt-AK"))?;
  let perch = Submenu::with_items(
    h,
    "Alt-AK",
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

  let timer = MenuItem::with_id(h, "toggle-timer", "Focus timer in the notch", true, None::<&str>)?;
  let rings = MenuItem::with_id(h, "toggle-rings", "Agent rings", true, None::<&str>)?;
  let hover = MenuItem::with_id(h, "toggle-hover", "Open when the pointer rests", true, None::<&str>)?;
  let view = Submenu::with_items(h, "View", true, &[&timer, &rings, &hover])?;

  let menu = Menu::with_items(h, &[&perch, &file, &edit, &view])?;
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

pub fn open_panel(app: &tauri::AppHandle) {
  let _ = app.emit("cove-menu", "open-panel");
}

pub fn open_settings(app: &tauri::AppHandle) {
  if let Some(win) = app.get_webview_window("settings") {
    let _ = win.close();
  }
  let _ = app.emit("cove-menu", "settings-inline");
}
