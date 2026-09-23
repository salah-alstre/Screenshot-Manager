//! Capture orchestration: overlay sessions for region/window selection,
//! direct full-screen/monitor/active-window captures, delayed capture, and
//! post-capture actions (save, copy, open editor, popup).

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use image::RgbaImage;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

use super::library::{self, CaptureMeta};
use crate::db::screenshots;
use crate::error::{AppError, AppResult};
use crate::events;
use crate::native::capture::{self as native, Frame, MonitorInfo, Rect};
use crate::native::clipboard;
use crate::state::AppState;

#[derive(Debug, Clone, Copy, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CaptureKind {
    Region,
    Window,
    ActiveWindow,
    Fullscreen,
    AllMonitors,
    Monitor,
    Delayed,
}

pub struct OverlaySession {
    pub id: u64,
    pub frame: Arc<Frame>,
    pub bmp: Arc<Vec<u8>>,
    pub monitors: Vec<MonitorInfo>,
}

#[derive(Default)]
pub struct CaptureState {
    pub session: Mutex<Option<OverlaySession>>,
    busy: AtomicBool,
    next_id: AtomicU64,
    restore_main: AtomicBool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OverlayStart {
    session_id: u64,
    mode: String,
    width: u32,
    height: u32,
    /// Monitor and window rectangles relative to the frame's top-left.
    monitors: Vec<Rect>,
    windows: Vec<native::WindowInfo>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PopupPayload {
    pub kind: String,
    pub id: Option<i64>,
    pub seconds: Option<u32>,
    pub version: Option<i64>,
}

fn hide_main_for_capture(app: &AppHandle, from_app: bool) {
    if let Some(popup) = app.get_webview_window("popup") {
        let _ = popup.hide();
    }
    if !from_app {
        return;
    }
    if let Some(main) = app.get_webview_window("main") {
        if main.is_visible().unwrap_or(false) && !main.is_minimized().unwrap_or(false) {
            let _ = main.hide();
            app.state::<AppState>().capture.restore_main.store(true, Ordering::SeqCst);
            // Give DWM time to finish the hide animation before grabbing pixels.
            std::thread::sleep(Duration::from_millis(280));
        }
    }
}

fn restore_main(app: &AppHandle) {
    if app.state::<AppState>().capture.restore_main.swap(false, Ordering::SeqCst) {
        crate::show_main_window(app);
    }
}

/// Entry point for every capture trigger (UI, tray, hotkeys).
pub fn start(app: &AppHandle, kind: CaptureKind, monitor: Option<usize>, from_app: bool) {
    let state = app.state::<AppState>();
    if state.capture.busy.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let result = run(&app, kind, monitor, from_app);
        let state = app.state::<AppState>();
        state.capture.busy.store(false, Ordering::SeqCst);
        if let Err(e) = result {
            restore_main(&app);
            events::error(&app, "capture", &e);
            crate::services::notify::capture_failed(&app);
        }
    });
}

fn run(app: &AppHandle, kind: CaptureKind, monitor: Option<usize>, from_app: bool) -> AppResult<()> {
    let state = app.state::<AppState>();
    let with_cursor = state.settings.read().capture_cursor;
    // For active-window capture, remember the foreground window before we change focus.
    let foreground = if kind == CaptureKind::ActiveWindow { native::foreground_window() } else { None };

    if kind == CaptureKind::Delayed {
        let seconds = state.settings.read().capture_delay.max(1);
        hide_main_for_capture(app, from_app);
        countdown(app, seconds);
        return open_overlay(app, "region", with_cursor);
    }

    hide_main_for_capture(app, from_app);
    match kind {
        CaptureKind::Region => open_overlay(app, "region", with_cursor),
        CaptureKind::Window => open_overlay(app, "window", with_cursor),
        CaptureKind::ActiveWindow => match foreground {
            Some(win) => {
                let frame = native::capture_virtual_screen(with_cursor)?;
                let monitors = native::monitors();
                let img = frame.crop_rgba(win.rect)?;
                let monitor = native::monitor_for_rect(&monitors, &win.rect).map(|m| m.name.clone());
                finish(app, img, CaptureMeta { mode: "activeWindow".into(), monitor }, None, Some(win.rect))
            }
            // SnapVault itself is focused (or nothing is): let the user pick a window instead.
            None => open_overlay(app, "window", with_cursor),
        },
        CaptureKind::Fullscreen | CaptureKind::AllMonitors | CaptureKind::Monitor => {
            let frame = native::capture_virtual_screen(with_cursor)?;
            let monitors = native::monitors();
            let target = state.settings.read().fullscreen_target.clone();
            let (rect, name, mode) = if kind == CaptureKind::AllMonitors || (kind == CaptureKind::Fullscreen && target == "all") {
                (frame.bounds(), Some(monitors.iter().map(|m| m.name.clone()).collect::<Vec<_>>().join(", ")), "all")
            } else {
                let chosen = match (kind, monitor) {
                    (CaptureKind::Monitor, Some(i)) => monitors.get(i),
                    _ if target == "primary" => monitors.iter().find(|m| m.primary),
                    _ => {
                        let (cx, cy) = native::cursor_pos();
                        monitors.iter().find(|m| m.rect.contains(cx, cy))
                    }
                }
                .or_else(|| monitors.first())
                .ok_or_else(|| AppError::Capture("no monitor".into()))?;
                (chosen.rect, Some(chosen.name.clone()), if kind == CaptureKind::Monitor { "monitor" } else { "fullscreen" })
            };
            let img = frame.crop_rgba(rect)?;
            finish(app, img, CaptureMeta { mode: mode.into(), monitor: name }, None, Some(rect))
        }
        CaptureKind::Delayed => unreachable!(),
    }
}

fn countdown(app: &AppHandle, seconds: u32) {
    show_popup(app, PopupPayload { kind: "countdown".into(), id: None, seconds: Some(seconds), version: None }, None);
    std::thread::sleep(Duration::from_secs(seconds as u64));
    if let Some(p) = app.get_webview_window("popup") {
        let _ = p.hide();
    }
    std::thread::sleep(Duration::from_millis(200));
}

fn open_overlay(app: &AppHandle, mode: &str, with_cursor: bool) -> AppResult<()> {
    let state = app.state::<AppState>();
    let frame = native::capture_virtual_screen(with_cursor)?;
    let monitors = native::monitors();
    let origin = (frame.origin_x, frame.origin_y);
    let relative = |r: Rect| Rect { x: r.x - origin.0, y: r.y - origin.1, w: r.w, h: r.h };
    let windows = native::list_windows()
        .into_iter()
        .map(|w| native::WindowInfo { title: w.title, rect: relative(w.rect) })
        .collect();
    let payload = OverlayStart {
        session_id: state.capture.next_id.fetch_add(1, Ordering::SeqCst) + 1,
        mode: mode.into(),
        width: frame.width,
        height: frame.height,
        monitors: monitors.iter().map(|m| relative(m.rect)).collect(),
        windows,
    };
    let bmp = Arc::new(frame.to_bmp());
    let bounds = frame.bounds();
    *state.capture.session.lock() =
        Some(OverlaySession { id: payload.session_id, frame: Arc::new(frame), bmp, monitors });

    let overlay = app
        .get_webview_window("overlay")
        .ok_or_else(|| AppError::Capture("overlay window missing".into()))?;
    overlay.set_position(PhysicalPosition::new(bounds.x, bounds.y))?;
    overlay.set_size(PhysicalSize::new(bounds.w as u32, bounds.h as u32))?;
    // The overlay page loads the frozen frame, then shows and focuses itself.
    overlay.emit("overlay-start", payload)?;
    Ok(())
}

/// Called by the overlay when the user confirms or cancels a selection.
/// `rect` is relative to the captured frame.
pub fn overlay_finish(app: &AppHandle, session_id: u64, action: &str, rect: Option<Rect>) -> AppResult<()> {
    let state = app.state::<AppState>();
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.hide();
    }
    let session = {
        let mut guard = state.capture.session.lock();
        match guard.as_ref() {
            Some(s) if s.id == session_id => guard.take(),
            _ => None,
        }
    };
    let Some(session) = session else { return Ok(()) };
    let rect = match (action, rect) {
        ("cancel", _) | (_, None) => {
            restore_main(app);
            return Ok(());
        }
        (_, Some(r)) => r,
    };
    if rect.w < 2 || rect.h < 2 {
        restore_main(app);
        return Ok(());
    }
    let virt = Rect { x: rect.x + session.frame.origin_x, y: rect.y + session.frame.origin_y, w: rect.w, h: rect.h };
    let img = session.frame.crop_rgba(virt)?;
    let monitor = native::monitor_for_rect(&session.monitors, &virt).map(|m| m.name.clone());
    let meta = CaptureMeta { mode: "region".into(), monitor };
    let override_action = match action {
        "copy" => Some("copy"),
        "edit" => Some("editor"),
        "save" => None,
        _ => None,
    };
    let app2 = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = finish(&app2, img, meta, override_action, Some(virt)) {
            events::error(&app2, "capture", &e);
        }
    });
    Ok(())
}

fn finish(app: &AppHandle, img: RgbaImage, meta: CaptureMeta, action: Option<&str>, rect: Option<Rect>) -> AppResult<()> {
    let state = app.state::<AppState>();
    let (configured, ocr_on, auto_ocr, popup_enabled) = {
        let s = state.settings.read();
        (s.capture_action.clone(), s.ocr_enabled, s.auto_ocr, s.show_capture_popup)
    };
    let action = action.unwrap_or(&configured).to_string();
    let popup_monitor = rect.and_then(|r| native::monitor_for_rect(&native::monitors(), &r).cloned());

    if action == "copy" {
        clipboard::copy_image(&img)?;
        restore_main(app);
        if popup_enabled {
            show_popup(app, PopupPayload { kind: "copied".into(), id: None, seconds: None, version: None }, popup_monitor);
        }
        crate::services::notify::capture_saved(app, true);
        return Ok(());
    }

    let id = library::save_capture(&state, &img, &meta)?;
    if action == "saveCopy" {
        if let Err(e) = clipboard::copy_image(&img) {
            events::error(app, "clipboard", &e);
        }
    }
    events::library_changed(app);
    if ocr_on && auto_ocr {
        state.ocr.enqueue(app, &[id]);
    }
    if action == "editor" {
        state.capture.restore_main.store(false, Ordering::SeqCst);
        crate::show_main_window(app);
        events::navigate(app, "editor", Some(id));
        return Ok(());
    }
    restore_main(app);
    if popup_enabled {
        let version = state.pool.get().ok().and_then(|c| screenshots::summary(&c, id).ok()).map(|s| s.image_version);
        show_popup(app, PopupPayload { kind: "saved".into(), id: Some(id), seconds: None, version }, popup_monitor);
    }
    crate::services::notify::capture_saved(app, false);
    Ok(())
}

pub const POPUP_W: f64 = 380.0;
pub const POPUP_H: f64 = 132.0;

/// Positions the popup at the bottom corner of the monitor's work area and asks it to show.
pub fn show_popup(app: &AppHandle, payload: PopupPayload, monitor: Option<MonitorInfo>) {
    let Some(popup) = app.get_webview_window("popup") else { return };
    let monitors = native::monitors();
    let m = monitor.or_else(|| monitors.iter().find(|m| m.primary).cloned()).or_else(|| monitors.first().cloned());
    if let Some(m) = m {
        let rtl = app.state::<AppState>().settings.read().language == "ar";
        let (w, h) = ((POPUP_W * m.scale) as i32, (POPUP_H * m.scale) as i32);
        let margin = (12.0 * m.scale) as i32;
        let x = if rtl { m.work.x + margin } else { m.work.x + m.work.w - w - margin };
        let y = m.work.y + m.work.h - h - margin;
        let _ = popup.set_size(PhysicalSize::new(w as u32, h as u32));
        let _ = popup.set_position(PhysicalPosition::new(x, y));
    }
    let _ = popup.emit("popup-show", payload);
}
