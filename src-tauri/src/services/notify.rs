//! Native Windows notifications (translated, and only when enabled in settings).

use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use super::i18n::t;
use crate::state::AppState;

fn lang(app: &AppHandle) -> String {
    app.try_state::<AppState>().map(|s| s.settings.read().language.clone()).unwrap_or_else(|| "en".into())
}

fn show(app: &AppHandle, title: &str, body: &str) {
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        log::warn!("notification failed: {e}");
    }
}

pub fn capture_saved(app: &AppHandle, copied_only: bool) {
    let Some(state) = app.try_state::<AppState>() else { return };
    let (enabled, popup) = {
        let s = state.settings.read();
        (s.notifications.capture, s.show_capture_popup)
    };
    if !enabled || popup {
        return;
    }
    let l = lang(app);
    let body = if copied_only { "native.copiedBody" } else { "native.capturedBody" };
    show(app, &t(&l, "native.capturedTitle", &[]), &t(&l, body, &[]));
}

pub fn capture_failed(app: &AppHandle) {
    let l = lang(app);
    show(app, &t(&l, "native.captureFailed", &[]), &t(&l, "errors.capture", &[]));
}

pub fn ocr_finished(app: &AppHandle, ok: u64, failed: u64) {
    let Some(state) = app.try_state::<AppState>() else { return };
    if !state.settings.read().notifications.ocr {
        return;
    }
    let l = lang(app);
    let mut body = t(&l, "native.ocrBody", &[("count", ok.to_string())]);
    if failed > 0 {
        body.push(' ');
        body.push_str(&t(&l, "native.ocrFailed", &[("count", failed.to_string())]));
    }
    show(app, &t(&l, "native.ocrTitle", &[]), &body);
}

pub fn exported(app: &AppHandle, count: usize) {
    let Some(state) = app.try_state::<AppState>() else { return };
    if !state.settings.read().notifications.export {
        return;
    }
    let l = lang(app);
    show(app, &t(&l, "native.exportTitle", &[]), &t(&l, "native.exported", &[("count", count.to_string())]));
}

/// Reports automatic (watched-folder) imports. Manual imports show in-app toasts instead.
pub fn imported(app: &AppHandle, count: usize) {
    let Some(state) = app.try_state::<AppState>() else { return };
    if count == 0 || !state.settings.read().notifications.import {
        return;
    }
    let l = lang(app);
    show(app, &t(&l, "native.importTitle", &[]), &t(&l, "native.imported", &[("count", count.to_string())]));
}

pub fn still_running(app: &AppHandle) {
    let l = lang(app);
    show(app, &t(&l, "native.trayTitle", &[]), &t(&l, "native.trayBody", &[]));
}
