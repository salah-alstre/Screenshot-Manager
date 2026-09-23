//! OCR commands.

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::db::screenshots;
use crate::error::{AppError, AppResult};
use crate::events;
use crate::native;
use crate::state::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrLanguages {
    pub installed: Vec<String>,
    pub arabic: bool,
    pub english: bool,
}

#[tauri::command]
pub fn ocr_languages() -> OcrLanguages {
    let installed = native::ocr::available_languages();
    let has = |p: &str| installed.iter().any(|t| t.to_ascii_lowercase().starts_with(p));
    OcrLanguages { arabic: has("ar"), english: has("en"), installed }
}

#[tauri::command]
pub fn run_ocr(app: AppHandle, state: State<'_, AppState>, ids: Vec<i64>) -> AppResult<usize> {
    if !state.settings.read().ocr_enabled {
        return Err(AppError::Invalid("ocr_disabled".into()));
    }
    state.ocr.enqueue(&app, &ids);
    Ok(ids.len())
}

/// Queues every screenshot that has no extracted text yet.
#[tauri::command]
pub fn run_ocr_pending(app: AppHandle, state: State<'_, AppState>) -> AppResult<usize> {
    if !state.settings.read().ocr_enabled {
        return Err(AppError::Invalid("ocr_disabled".into()));
    }
    let ids = screenshots::ids_needing_ocr(&*state.pool.get()?)?;
    state.ocr.enqueue(&app, &ids);
    Ok(ids.len())
}

/// Re-extracts text from every screenshot (manual edits are replaced).
#[tauri::command]
pub fn rebuild_ocr_index(app: AppHandle, state: State<'_, AppState>) -> AppResult<usize> {
    if !state.settings.read().ocr_enabled {
        return Err(AppError::Invalid("ocr_disabled".into()));
    }
    let ids = screenshots::all_active_ids(&*state.pool.get()?)?;
    state.ocr.enqueue(&app, &ids);
    Ok(ids.len())
}

/// Saves manually corrected OCR text.
#[tauri::command]
pub fn update_ocr_text(app: AppHandle, state: State<'_, AppState>, id: i64, text: String) -> AppResult<()> {
    if text.len() > 2_000_000 {
        return Err(AppError::Invalid("text too long".into()));
    }
    let conn = state.pool.get()?;
    let (language, engine) = screenshots::get_ocr(&conn, id)?
        .map(|o| (o.language, o.engine))
        .unwrap_or_else(|| ("manual".into(), "manual".into()));
    screenshots::save_ocr(&conn, id, &text, None, &language, &engine, true)?;
    events::screenshots_updated(&app, &[id]);
    Ok(())
}
