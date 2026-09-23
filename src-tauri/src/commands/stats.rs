//! Dashboard, storage, cleanup, duplicates and background task commands.

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::db::stats::{self, DashboardStats, DuplicateGroup, StorageStats};
use crate::db::{now_ms, screenshots};
use crate::error::{AppError, AppResult};
use crate::events;
use crate::services::tasks::TaskInfo;
use crate::state::AppState;

#[tauri::command]
pub fn dashboard_stats(state: State<'_, AppState>, today_start: i64, week_start: i64) -> AppResult<DashboardStats> {
    stats::dashboard(&*state.pool.get()?, today_start, week_start)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusInfo {
    pub total_bytes: i64,
    pub count: i64,
    pub watched_folders: usize,
    pub monitoring_paused: bool,
    pub ocr_pending: i64,
}

#[tauri::command]
pub fn status_info(state: State<'_, AppState>) -> AppResult<StatusInfo> {
    let conn = state.pool.get()?;
    let (count, total_bytes): (i64, i64) = conn.query_row(
        "SELECT count(*), COALESCE(sum(file_size), 0) FROM screenshots WHERE trashed_at IS NULL",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let ocr_pending: i64 = conn.query_row(
        "SELECT count(*) FROM screenshots WHERE trashed_at IS NULL AND ocr_status IN ('none','failed','pending')",
        [],
        |r| r.get(0),
    )?;
    Ok(StatusInfo {
        total_bytes,
        count,
        watched_folders: state.watcher.watched_count(),
        monitoring_paused: state.settings.read().monitoring_paused,
        ocr_pending,
    })
}

#[tauri::command]
pub fn storage_stats(state: State<'_, AppState>) -> AppResult<StorageStats> {
    stats::storage(&*state.pool.get()?)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupPreview {
    pub count: usize,
    pub bytes: i64,
}

#[tauri::command]
pub fn cleanup_preview(state: State<'_, AppState>, older_than_days: i64, include_favorites: bool) -> AppResult<CleanupPreview> {
    let cutoff = now_ms() - older_than_days.max(1) * 86_400_000;
    let (ids, bytes) = stats::older_than(&*state.pool.get()?, cutoff, include_favorites)?;
    Ok(CleanupPreview { count: ids.len(), bytes })
}

/// Moves old screenshots to Trash (never deletes). Requires explicit confirmation in the UI.
#[tauri::command]
pub fn cleanup_old(app: AppHandle, state: State<'_, AppState>, older_than_days: i64, include_favorites: bool) -> AppResult<usize> {
    let cutoff = now_ms() - older_than_days.max(1) * 86_400_000;
    let conn = state.pool.get()?;
    let (ids, _) = stats::older_than(&conn, cutoff, include_favorites)?;
    let n = screenshots::trash(&conn, &ids)?;
    events::library_changed(&app);
    Ok(n)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateReport {
    pub exact: Vec<DuplicateGroup>,
    pub similar: Vec<DuplicateGroup>,
}

/// Maximum Hamming distance (of 256 bits) for two screenshots to count as similar.
const SIMILAR_THRESHOLD: u32 = 18;

#[tauri::command]
pub async fn scan_duplicates(app: AppHandle, state: State<'_, AppState>) -> AppResult<DuplicateReport> {
    let task = state.tasks.start(&app, "duplicates", 2, None);
    let conn = state.pool.get()?;
    let exact = stats::exact_duplicates(&conn)?;
    task.set_progress(1, 2);
    let similar = stats::similar_groups(&conn, SIMILAR_THRESHOLD, &|| task.is_cancelled())?;
    task.set_progress(2, 2);
    task.finish("done");
    Ok(DuplicateReport { exact, similar })
}

#[tauri::command]
pub fn ignore_duplicates(state: State<'_, AppState>, ids: Vec<i64>) -> AppResult<()> {
    if ids.len() < 2 {
        return Err(AppError::Invalid("need at least two screenshots".into()));
    }
    stats::ignore_group(&*state.pool.get()?, &ids)
}

#[tauri::command]
pub fn list_tasks(state: State<'_, AppState>) -> Vec<TaskInfo> {
    state.tasks.list()
}

#[tauri::command]
pub fn cancel_task(state: State<'_, AppState>, id: u64) {
    state.tasks.cancel(id);
}
