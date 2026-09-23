//! Settings and application-level commands.

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_opener::OpenerExt;

use crate::db::settings::{self, Settings};
use crate::error::{AppError, AppResult};
use crate::services::paths;
use crate::state::AppState;
use crate::{events, hotkeys, tray};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsUpdate {
    pub settings: Settings,
    /// Global shortcut actions that could not be registered (e.g. taken by another app).
    pub hotkey_errors: Vec<String>,
}

/// Validates and stores a settings patch, then applies side effects.
pub fn apply_patch(app: &AppHandle, patch: Value) -> AppResult<SettingsUpdate> {
    let state = app.state::<AppState>();
    if let Some(root) = patch.get("libraryRoot").and_then(|v| v.as_str()) {
        if !root.trim().is_empty() {
            let p = std::path::Path::new(root);
            if !p.is_absolute() {
                return Err(AppError::Invalid("library folder must be absolute".into()));
            }
            std::fs::create_dir_all(p).map_err(|_| AppError::FolderUnavailable(root.to_string()))?;
        }
    }
    let (next, changed) = settings::update(&*state.pool.get()?, &patch)?;
    let previous = std::mem::replace(&mut *state.settings.write(), next.clone());
    let mut hotkey_errors = Vec::new();

    for key in &changed {
        match key.as_str() {
            "language" => tray::refresh(app),
            "hotkeys" => hotkey_errors = hotkeys::register_all(app, &next.hotkeys),
            "launchAtStartup" => {
                let al = app.autolaunch();
                let r = if next.launch_at_startup { al.enable() } else { al.disable() };
                if let Err(e) = r {
                    // Roll back so the UI reflects reality.
                    log::error!("autostart change failed: {e}");
                    let _ = settings::update(&*state.pool.get()?, &serde_json::json!({ "launchAtStartup": previous.launch_at_startup }));
                    state.settings.write().launch_at_startup = previous.launch_at_startup;
                    return Err(AppError::Other("autostart".into()));
                }
            }
            "monitoringPaused" => {
                tray::refresh(app);
                if !next.monitoring_paused {
                    crate::services::watcher::catch_up(app, None);
                }
            }
            "ocrEnabled" if !next.ocr_enabled => state.ocr.cancel_all(),
            _ => {}
        }
    }
    let current = state.settings.read().clone();
    if !changed.is_empty() {
        events::settings_changed(app, &current);
    }
    Ok(SettingsUpdate { settings: current, hotkey_errors })
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings.read().clone()
}

#[tauri::command]
pub fn update_settings(app: AppHandle, patch: Value) -> AppResult<SettingsUpdate> {
    apply_patch(&app, patch)
}

/// Temporarily releases global shortcuts (while the user records a new one),
/// so pressing an existing combination doesn't trigger a capture.
#[tauri::command]
pub fn set_hotkeys_suspended(app: AppHandle, state: State<'_, AppState>, suspended: bool) -> Vec<String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    if suspended {
        let _ = app.global_shortcut().unregister_all();
        state.hotkeys.lock().clear();
        Vec::new()
    } else {
        let keys = state.settings.read().hotkeys.clone();
        hotkeys::register_all(&app, &keys)
    }
}

/// Global shortcut actions that are configured but not currently registered.
#[tauri::command]
pub fn hotkey_status(state: State<'_, AppState>) -> Vec<String> {
    let s = state.settings.read();
    let map = state.hotkeys.lock();
    [("region", &s.hotkeys.region), ("window", &s.hotkeys.window), ("fullscreen", &s.hotkeys.fullscreen), ("openApp", &s.hotkeys.open_app)]
        .into_iter()
        .filter(|(action, key)| !key.is_empty() && !map.iter().any(|(_, a)| a == action))
        .map(|(a, _)| a.to_string())
        .collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub tauri_version: String,
    pub webview_version: String,
    pub schema_version: i64,
    pub data_dir: String,
    pub logs_dir: String,
    pub library_root: String,
    pub default_library_root: String,
    pub repository_url: Option<String>,
    pub platform: String,
}

/// Set this to the project's public repository when publishing.
const REPOSITORY_URL: Option<&str> = None;

#[tauri::command]
pub fn app_info(app: AppHandle, state: State<'_, AppState>) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        tauri_version: tauri::VERSION.to_string(),
        webview_version: tauri::webview_version().unwrap_or_default(),
        schema_version: crate::db::migrations::schema_version(),
        data_dir: state.paths.data_dir.to_string_lossy().to_string(),
        logs_dir: state.paths.logs_dir.to_string_lossy().to_string(),
        library_root: state.library_root().to_string_lossy().to_string(),
        default_library_root: state.paths.default_library_root.to_string_lossy().to_string(),
        repository_url: REPOSITORY_URL.map(String::from),
        platform: std::env::consts::OS.to_string(),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    /// "not_configured" until an update channel is set up (see README roadmap).
    pub status: String,
    pub current_version: String,
}

/// Update architecture placeholder: SnapVault never downloads or runs update
/// code unless a signed update channel is configured.
#[tauri::command]
pub fn check_for_updates(app: AppHandle) -> UpdateStatus {
    UpdateStatus { status: "not_configured".into(), current_version: app.package_info().version.to_string() }
}

#[tauri::command]
pub fn open_logs_folder(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    app.opener()
        .open_path(state.paths.logs_dir.to_string_lossy(), None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))
}

#[tauri::command]
pub fn open_data_folder(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    app.opener()
        .open_path(state.paths.data_dir.to_string_lossy(), None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))
}

#[tauri::command]
pub fn open_library_folder(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    let root = state.library_root();
    std::fs::create_dir_all(&root).map_err(|_| AppError::FolderUnavailable(root.display().to_string()))?;
    app.opener().open_path(root.to_string_lossy(), None::<&str>).map_err(|e| AppError::Other(e.to_string()))
}

#[tauri::command]
pub async fn rebuild_search_index(state: State<'_, AppState>) -> AppResult<usize> {
    let mut conn = state.pool.get()?;
    let tx = conn.transaction()?;
    let n = crate::db::search::rebuild_all(&tx)?;
    tx.commit()?;
    Ok(n)
}

#[tauri::command]
pub async fn regenerate_thumbnails(app: AppHandle, state: State<'_, AppState>) -> AppResult<usize> {
    let ids = crate::db::screenshots::all_active_ids(&*state.pool.get()?)?;
    let task = state.tasks.start(&app, "thumbnails", ids.len() as u64, None);
    let mut done = 0;
    for (i, &id) in ids.iter().enumerate() {
        if task.is_cancelled() {
            break;
        }
        crate::services::library::invalidate_thumbnail(&state, id);
        if crate::services::library::ensure_thumbnail(&state, id).is_ok() {
            done += 1;
        }
        task.set_progress(i as u64 + 1, ids.len() as u64);
    }
    task.finish(if task.is_cancelled() { "cancelled" } else { "done" });
    // New cache key so the webview doesn't keep showing the old previews.
    state.pool.get()?.execute("UPDATE screenshots SET image_version = image_version + 1", [])?;
    events::library_changed(&app);
    Ok(done)
}

/// Called by the main window once its UI has rendered, to avoid a blank flash.
#[tauri::command]
pub fn app_ready(app: AppHandle) {
    if !crate::START_MINIMIZED.load(std::sync::atomic::Ordering::SeqCst) {
        crate::show_main_window(&app);
    }
}

#[tauri::command]
pub fn default_library_root(state: State<'_, AppState>) -> String {
    paths::library_root("", &state.paths).to_string_lossy().to_string()
}

#[tauri::command]
pub fn tray_hint(app: AppHandle, state: State<'_, AppState>) {
    let shown = state.settings.read().tray_hint_shown;
    if !shown {
        crate::services::notify::still_running(&app);
        let _ = apply_patch(&app, serde_json::json!({ "trayHintShown": true }));
    }
}
