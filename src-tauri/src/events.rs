//! Events emitted to the frontend.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Library contents changed (items added/removed); lists should refresh.
pub fn library_changed(app: &AppHandle) {
    let _ = app.emit("library-changed", ());
}

/// Specific screenshots changed (favorite, tags, OCR status, …).
pub fn screenshots_updated(app: &AppHandle, ids: &[i64]) {
    let _ = app.emit("screenshots-updated", ids);
}

pub fn settings_changed<S: Serialize + Clone>(app: &AppHandle, settings: &S) {
    let _ = app.emit("settings-changed", settings.clone());
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NavigatePayload {
    pub view: String,
    pub id: Option<i64>,
}

/// Asks the main window to navigate (e.g. from the tray or capture popup).
pub fn navigate(app: &AppHandle, view: &str, id: Option<i64>) {
    let _ = app.emit_to("main", "navigate", NavigatePayload { view: view.into(), id });
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub imported: usize,
    pub duplicates: usize,
    pub failed: usize,
    pub first_id: Option<i64>,
}

pub fn import_finished(app: &AppHandle, report: &ImportReport) {
    let _ = app.emit("import-finished", report.clone());
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    pub code: String,
    pub context: String,
}

/// Reports a failure from a background flow (capture, watcher) to the UI.
pub fn error(app: &AppHandle, context: &str, err: &crate::error::AppError) {
    log::error!("{context}: [{}] {err}", err.code());
    let _ = app.emit("app-error", ErrorPayload { code: err.code().into(), context: context.into() });
}
