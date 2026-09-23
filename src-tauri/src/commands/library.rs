//! Library commands: listing, details, favorites, trash, rename, notes, clipboard.

use std::path::Path;

use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::db::models::{Page, ScreenshotDetail, ScreenshotSummary};
use crate::db::screenshots::{self, ListQuery, OcrHit};
use crate::error::{AppError, AppResult};
use crate::events;
use crate::native::clipboard;
use crate::services::library;
use crate::state::AppState;

#[tauri::command]
pub fn list_screenshots(state: State<'_, AppState>, query: ListQuery) -> AppResult<Page<ScreenshotSummary>> {
    let conn = state.pool.get()?;
    screenshots::list(&conn, &query)
}

#[tauri::command]
pub fn list_screenshot_ids(state: State<'_, AppState>, query: ListQuery) -> AppResult<Vec<i64>> {
    let conn = state.pool.get()?;
    screenshots::list_ids(&conn, &query)
}

#[tauri::command]
pub fn search_ocr(state: State<'_, AppState>, query: ListQuery) -> AppResult<Page<OcrHit>> {
    let conn = state.pool.get()?;
    screenshots::ocr_hits(&conn, &query)
}

#[tauri::command]
pub fn get_screenshot(state: State<'_, AppState>, id: i64) -> AppResult<ScreenshotDetail> {
    let conn = state.pool.get()?;
    let detail = screenshots::detail(&conn, id)?;
    // Keep the "missing" flag in sync with reality when details are opened.
    if detail.file_exists == detail.summary.missing {
        screenshots::set_missing(&conn, id, !detail.file_exists)?;
    }
    Ok(detail)
}

#[tauri::command]
pub fn get_summaries(state: State<'_, AppState>, ids: Vec<i64>) -> AppResult<Vec<ScreenshotSummary>> {
    let conn = state.pool.get()?;
    screenshots::summaries_by_ids(&conn, &ids)
}

#[tauri::command]
pub fn set_favorite(app: AppHandle, state: State<'_, AppState>, ids: Vec<i64>, favorite: bool) -> AppResult<usize> {
    let conn = state.pool.get()?;
    let n = screenshots::set_favorite(&conn, &ids, favorite)?;
    events::screenshots_updated(&app, &ids);
    events::library_changed(&app);
    Ok(n)
}

#[tauri::command]
pub fn move_to_collection(
    app: AppHandle,
    state: State<'_, AppState>,
    ids: Vec<i64>,
    collection_id: Option<i64>,
) -> AppResult<usize> {
    let mut conn = state.pool.get()?;
    let tx = conn.transaction()?;
    let n = screenshots::set_collection(&tx, &ids, collection_id)?;
    tx.commit()?;
    events::library_changed(&app);
    Ok(n)
}

#[tauri::command]
pub fn trash_screenshots(app: AppHandle, state: State<'_, AppState>, ids: Vec<i64>) -> AppResult<usize> {
    let conn = state.pool.get()?;
    let n = screenshots::trash(&conn, &ids)?;
    events::library_changed(&app);
    Ok(n)
}

#[tauri::command]
pub fn restore_screenshots(app: AppHandle, state: State<'_, AppState>, ids: Vec<i64>) -> AppResult<usize> {
    let conn = state.pool.get()?;
    let n = screenshots::restore(&conn, &ids)?;
    events::library_changed(&app);
    Ok(n)
}

/// Permanently deletes screenshots that are already in Trash. Files go to the Recycle Bin.
#[tauri::command]
pub async fn delete_permanently(app: AppHandle, state: State<'_, AppState>, ids: Vec<i64>) -> AppResult<usize> {
    let trashed: Vec<i64> = {
        let conn = state.pool.get()?;
        screenshots::summaries_by_ids(&conn, &ids)?
            .into_iter()
            .filter(|s| s.trashed_at.is_some())
            .map(|s| s.id)
            .collect()
    };
    let n = library::delete_permanently(&state, &trashed)?;
    events::library_changed(&app);
    Ok(n)
}

#[tauri::command]
pub async fn empty_trash(app: AppHandle, state: State<'_, AppState>) -> AppResult<usize> {
    let ids = {
        let conn = state.pool.get()?;
        screenshots::all_trashed(&conn)?
    };
    let n = library::delete_permanently(&state, &ids)?;
    events::library_changed(&app);
    Ok(n)
}

#[tauri::command]
pub fn rename_screenshot(app: AppHandle, state: State<'_, AppState>, id: i64, name: String) -> AppResult<()> {
    library::rename(&state, id, &name)?;
    events::screenshots_updated(&app, &[id]);
    events::library_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn save_note(app: AppHandle, state: State<'_, AppState>, id: i64, body: String) -> AppResult<()> {
    if body.chars().count() > 20_000 {
        return Err(AppError::Invalid("note too long".into()));
    }
    let conn = state.pool.get()?;
    screenshots::set_note(&conn, id, &body)?;
    events::screenshots_updated(&app, &[id]);
    Ok(())
}

#[tauri::command]
pub async fn copy_image(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    let img = library::load_rgba(&state, id)?;
    clipboard::copy_image(&img)
}

#[tauri::command]
pub fn copy_text(text: String) -> AppResult<()> {
    clipboard::copy_text(&text)
}

#[tauri::command]
pub fn open_file_location(app: AppHandle, state: State<'_, AppState>, id: i64) -> AppResult<()> {
    let conn = state.pool.get()?;
    let file = screenshots::file_ref(&conn, id)?;
    let path = file.current_path();
    if !Path::new(path).exists() {
        return Err(AppError::NotFound("file".into()));
    }
    app.opener().reveal_item_in_dir(path).map_err(|e| AppError::Other(e.to_string()))
}

#[tauri::command]
pub fn revert_edit(app: AppHandle, id: i64) -> AppResult<()> {
    library::revert_edit(&app, id)
}
