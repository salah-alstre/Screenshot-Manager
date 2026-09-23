//! Commands that involve user-chosen files and folders. Paths never come from
//! the frontend: every location is picked in a native dialog opened here.

use std::path::PathBuf;

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::db::models::WatchedFolder;
use crate::db::{collections, screenshots, watched};
use crate::error::{AppError, AppResult};
use crate::events::{self, ImportReport};
use crate::services::library::{self, EditMode, ImportMode};
use crate::services::{export, watcher};
use crate::state::AppState;

fn main_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("main")
}

fn pick_folder(app: &AppHandle) -> Option<PathBuf> {
    let mut dialog = app.dialog().file();
    if let Some(w) = main_window(app) {
        dialog = dialog.set_parent(&w);
    }
    dialog.blocking_pick_folder().and_then(|p| p.into_path().ok())
}

/// Opens a file picker and imports the chosen images (copied into the library).
#[tauri::command]
pub async fn import_dialog(app: AppHandle) -> AppResult<ImportReport> {
    let mut dialog = app.dialog().file().add_filter("Images", &["png", "jpg", "jpeg", "webp", "bmp"]);
    if let Some(w) = main_window(&app) {
        dialog = dialog.set_parent(&w);
    }
    let files: Vec<PathBuf> = dialog
        .blocking_pick_files()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|p| p.into_path().ok())
        .collect();
    if files.is_empty() {
        return Err(AppError::Cancelled);
    }
    let report = library::import_paths(&app, files, ImportMode::Copy, "import");
    Ok(report)
}

#[tauri::command]
pub fn list_watched_folders(state: State<'_, AppState>) -> AppResult<Vec<WatchedFolder>> {
    watched::list(&*state.pool.get()?)
}

/// The Windows "Pictures\Screenshots" folder, if it exists and isn't watched yet.
#[tauri::command]
pub fn suggested_watch_folder(app: AppHandle, state: State<'_, AppState>) -> AppResult<Option<String>> {
    let Ok(pictures) = app.path().picture_dir() else { return Ok(None) };
    let candidate = pictures.join("Screenshots");
    if !candidate.is_dir() {
        return Ok(None);
    }
    let s = candidate.to_string_lossy().to_string();
    let already = watched::list(&*state.pool.get()?)?.iter().any(|f| f.path.eq_ignore_ascii_case(&s));
    Ok(if already { None } else { Some(s) })
}

fn add_folder(app: &AppHandle, path: PathBuf) -> AppResult<WatchedFolder> {
    let state = app.state::<AppState>();
    if !path.is_dir() {
        return Err(AppError::FolderUnavailable(path.display().to_string()));
    }
    let folder = watched::add(&*state.pool.get()?, &path.to_string_lossy())?;
    state.watcher.restart(app);
    watcher::catch_up(app, Some(folder.id));
    Ok(folder)
}

#[tauri::command]
pub async fn add_watched_folder(app: AppHandle) -> AppResult<WatchedFolder> {
    let path = pick_folder(&app).ok_or(AppError::Cancelled)?;
    add_folder(&app, path)
}

/// Adds the suggested Windows Screenshots folder (no dialog; the path is resolved here).
#[tauri::command]
pub fn add_suggested_watch_folder(app: AppHandle) -> AppResult<WatchedFolder> {
    let pictures = app.path().picture_dir().map_err(|e| AppError::Other(e.to_string()))?;
    add_folder(&app, pictures.join("Screenshots"))
}

#[tauri::command]
pub fn set_watched_folder_enabled(app: AppHandle, state: State<'_, AppState>, id: i64, enabled: bool) -> AppResult<()> {
    watched::set_enabled(&*state.pool.get()?, id, enabled)?;
    state.watcher.restart(&app);
    if enabled {
        watcher::catch_up(&app, Some(id));
    }
    Ok(())
}

#[tauri::command]
pub fn remove_watched_folder(app: AppHandle, state: State<'_, AppState>, id: i64) -> AppResult<()> {
    watched::remove(&*state.pool.get()?, id)?;
    state.watcher.restart(&app);
    Ok(())
}

/// Lets the user choose a new library folder; returns the chosen path.
#[tauri::command]
pub async fn choose_library_root(app: AppHandle) -> AppResult<String> {
    let path = pick_folder(&app).ok_or(AppError::Cancelled)?;
    let s = path.to_string_lossy().to_string();
    crate::commands::settings::apply_patch(&app, serde_json::json!({ "libraryRoot": s }))?;
    Ok(s)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub exported: usize,
    pub failed: usize,
    pub folder: String,
}

/// Exports screenshots. A single screenshot opens a save dialog; several open a folder picker.
#[tauri::command]
pub async fn export_screenshots(
    app: AppHandle,
    state: State<'_, AppState>,
    ids: Vec<i64>,
    format: String,
    quality: u8,
) -> AppResult<ExportResult> {
    let format = export::normalize_format(&format)?;
    if ids.is_empty() {
        return Err(AppError::Invalid("nothing to export".into()));
    }
    let result = if ids.len() == 1 {
        let name = screenshots::file_ref(&*state.pool.get()?, ids[0])?.name;
        let mut dialog = app
            .dialog()
            .file()
            .set_file_name(format!("{name}.{format}"))
            .add_filter(format.to_uppercase(), &[format]);
        if let Some(w) = main_window(&app) {
            dialog = dialog.set_parent(&w);
        }
        let dest = dialog.blocking_save_file().and_then(|p| p.into_path().ok()).ok_or(AppError::Cancelled)?;
        export::export_to(&state, ids[0], &dest, format, quality)?;
        ExportResult {
            exported: 1,
            failed: 0,
            folder: dest.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
        }
    } else {
        let dir = pick_folder(&app).ok_or(AppError::Cancelled)?;
        let (exported, failed) = export::export_many(&app, &ids, &dir, format, quality)?;
        ExportResult { exported, failed, folder: dir.to_string_lossy().to_string() }
    };
    crate::services::notify::exported(&app, result.exported);
    Ok(result)
}

#[tauri::command]
pub async fn export_collection(
    app: AppHandle,
    state: State<'_, AppState>,
    collection_id: i64,
    format: String,
    quality: u8,
) -> AppResult<ExportResult> {
    let ids: Vec<i64> = {
        let conn = state.pool.get()?;
        let members = collections::member_ids(&conn, collection_id)?;
        screenshots::summaries_by_ids(&conn, &members)?
            .into_iter()
            .filter(|s| s.trashed_at.is_none())
            .map(|s| s.id)
            .collect()
    };
    if ids.is_empty() {
        return Err(AppError::Invalid("nothing to export".into()));
    }
    let dir = pick_folder(&app).ok_or(AppError::Cancelled)?;
    let (exported, failed) = export::export_many(&app, &ids, &dir, &format, quality)?;
    crate::services::notify::exported(&app, exported);
    Ok(ExportResult { exported, failed, folder: dir.to_string_lossy().to_string() })
}

#[tauri::command]
pub fn open_folder(app: AppHandle, path: String, state: State<'_, AppState>) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    // Only folders SnapVault knows about can be opened this way.
    let allowed = {
        let conn = state.pool.get()?;
        let mut v: Vec<String> = watched::list(&conn)?.into_iter().map(|f| f.path).collect();
        v.push(state.library_root().to_string_lossy().to_string());
        v
    };
    if !allowed.iter().any(|a| a.eq_ignore_ascii_case(&path)) {
        return Err(AppError::Invalid("folder not allowed".into()));
    }
    std::fs::create_dir_all(&path).ok();
    app.opener().open_path(&path, None::<&str>).map_err(|e| AppError::Other(e.to_string()))
}

fn header(request: &Request<'_>, name: &str) -> AppResult<String> {
    request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::Invalid(format!("missing header {name}")))
}

fn raw_body<'a>(request: &'a Request<'_>) -> AppResult<&'a [u8]> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes),
        _ => Err(AppError::Invalid("expected binary body".into())),
    }
}

/// Saves editor output. Body: PNG bytes. Headers: `x-sv-id`, `x-sv-mode` (keep|copy|replace).
#[tauri::command]
pub async fn save_edit(app: AppHandle, request: Request<'_>) -> AppResult<i64> {
    let id: i64 = header(&request, "x-sv-id")?.parse().map_err(|_| AppError::Invalid("bad id".into()))?;
    let mode = match header(&request, "x-sv-mode")?.as_str() {
        "copy" => EditMode::Copy,
        "replace" => EditMode::Replace,
        _ => EditMode::KeepOriginal,
    };
    let bytes = raw_body(&request)?.to_vec();
    library::save_edit(&app, id, &bytes, mode)
}

/// Copies PNG bytes (e.g. the editor canvas) to the clipboard.
#[tauri::command]
pub async fn copy_png(request: Request<'_>) -> AppResult<()> {
    let bytes = raw_body(&request)?;
    let img = crate::services::imaging::decode(bytes, image::ImageFormat::Png)?.to_rgba8();
    crate::native::clipboard::copy_image(&img)
}

/// Saves PNG bytes from the editor to a file chosen in a save dialog. Header `x-sv-format`, `x-sv-quality`, `x-sv-name`.
#[tauri::command]
pub async fn export_png(app: AppHandle, request: Request<'_>) -> AppResult<String> {
    let format = export::normalize_format(&header(&request, "x-sv-format").unwrap_or_else(|_| "png".into()))?;
    let quality: u8 = header(&request, "x-sv-quality").ok().and_then(|q| q.parse().ok()).unwrap_or(90);
    let name = header(&request, "x-sv-name").ok().map(|n| percent_decode(&n)).unwrap_or_else(|| "Screenshot".into());
    let name = crate::services::paths::sanitize_file_stem(&name).unwrap_or_else(|_| "Screenshot".into());
    let img = crate::services::imaging::decode(raw_body(&request)?, image::ImageFormat::Png)?;
    let mut dialog = app.dialog().file().set_file_name(format!("{name}.{format}")).add_filter(format.to_uppercase(), &[format]);
    if let Some(w) = main_window(&app) {
        dialog = dialog.set_parent(&w);
    }
    let dest = dialog.blocking_save_file().and_then(|p| p.into_path().ok()).ok_or(AppError::Cancelled)?;
    let bytes = crate::services::imaging::encode(&img, format, quality)?;
    crate::services::paths::write_atomic(&dest, &bytes)?;
    Ok(dest.to_string_lossy().to_string())
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Re-imports dropped files; used by the main window's drag-and-drop handler.
pub fn import_dropped(app: &AppHandle, paths: Vec<PathBuf>) {
    let app = app.clone();
    std::thread::spawn(move || {
        let copy = app.state::<AppState>().settings.read().copy_dropped_files;
        let mode = if copy { ImportMode::Copy } else { ImportMode::Reference };
        let mut files = Vec::new();
        for p in paths {
            if p.is_dir() {
                files.extend(library::images_in_dir(&p));
            } else {
                files.push(p);
            }
        }
        let total = files.len();
        let mut report = library::import_paths(&app, files, mode, "drop");
        // Files filtered out before import (unsupported types) count as failures.
        let counted = report.imported + report.duplicates + report.failed;
        report.failed += total.saturating_sub(counted);
        events::import_finished(&app, &report);
    });
}

#[cfg(test)]
mod tests {
    #[test]
    fn decodes_percent_encoding() {
        assert_eq!(super::percent_decode("Bug%20report"), "Bug report");
        assert_eq!(super::percent_decode("%D9%84%D9%82%D8%B7%D8%A9"), "لقطة");
        assert_eq!(super::percent_decode("100%"), "100%");
    }
}
