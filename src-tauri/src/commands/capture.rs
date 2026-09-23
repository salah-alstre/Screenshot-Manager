//! Capture commands.

use tauri::{AppHandle, Manager, State};

use crate::db::screenshots;
use crate::error::AppResult;
use crate::native::capture::{self as native, MonitorInfo, Rect};
use crate::services::capture::{self, CaptureKind};
use crate::state::AppState;

#[tauri::command]
pub fn start_capture(app: AppHandle, kind: CaptureKind, monitor: Option<usize>) {
    capture::start(&app, kind, monitor, true);
}

#[tauri::command]
pub fn list_monitors() -> Vec<MonitorInfo> {
    native::monitors()
}

#[tauri::command]
pub fn overlay_finish(app: AppHandle, session_id: u64, action: String, rect: Option<Rect>) -> AppResult<()> {
    capture::overlay_finish(&app, session_id, &action, rect)
}

/// Actions from the post-capture popup.
#[tauri::command]
pub async fn popup_action(app: AppHandle, state: State<'_, AppState>, action: String, id: i64) -> AppResult<()> {
    match action.as_str() {
        "copy" => {
            let img = crate::services::library::load_rgba(&state, id)?;
            crate::native::clipboard::copy_image(&img)?;
        }
        "open" | "edit" => {
            crate::show_main_window(&app);
            crate::events::navigate(&app, if action == "edit" { "editor" } else { "viewer" }, Some(id));
        }
        "delete" => {
            screenshots::trash(&*state.pool.get()?, &[id])?;
            crate::events::library_changed(&app);
        }
        _ => {}
    }
    if action != "copy" && action != "delete" {
        if let Some(p) = app.get_webview_window("popup") {
            let _ = p.hide();
        }
    }
    Ok(())
}
