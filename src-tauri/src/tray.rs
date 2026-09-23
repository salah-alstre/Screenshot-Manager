//! System tray icon and menu (localized, rebuilt when the language changes).

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::services::capture::{self, CaptureKind};
use crate::services::i18n::t;
use crate::state::AppState;

const TRAY_ID: &str = "snapvault-tray";

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let state = app.state::<AppState>();
    let (lang, paused) = {
        let s = state.settings.read();
        (s.language.clone(), s.monitoring_paused)
    };
    let item = |id: &str, key: &str| MenuItem::with_id(app, id, t(&lang, key, &[]), true, None::<&str>);
    Menu::with_items(
        app,
        &[
            &item("capture-region", "tray.captureRegion")?,
            &item("capture-window", "tray.captureWindow")?,
            &item("capture-fullscreen", "tray.captureFullscreen")?,
            &PredefinedMenuItem::separator(app)?,
            &item("open", "tray.open")?,
            &CheckMenuItem::with_id(app, "pause", t(&lang, "tray.pause", &[]), true, paused, None::<&str>)?,
            &item("settings", "tray.settings")?,
            &PredefinedMenuItem::separator(app)?,
            &item("quit", "tray.quit")?,
        ],
    )
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;
    let lang = app.state::<AppState>().settings.read().language.clone();
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(app.default_window_icon().cloned().expect("app icon"))
        .tooltip(t(&lang, "tray.tooltip", &[]))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "capture-region" => capture::start(app, CaptureKind::Region, None, false),
            "capture-window" => capture::start(app, CaptureKind::Window, None, false),
            "capture-fullscreen" => capture::start(app, CaptureKind::Fullscreen, None, false),
            "open" => crate::show_main_window(app),
            "settings" => {
                crate::show_main_window(app);
                crate::events::navigate(app, "settings", None);
            }
            "pause" => {
                let paused = !app.state::<AppState>().settings.read().monitoring_paused;
                if let Err(e) = crate::commands::settings::apply_patch(app, serde_json::json!({ "monitoringPaused": paused })) {
                    log::error!("toggle monitoring failed: {e}");
                }
            }
            "quit" => {
                crate::QUITTING.store(true, std::sync::atomic::Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } => crate::show_main_window(tray.app_handle()),
            TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } => {
                crate::show_main_window(tray.app_handle())
            }
            _ => {}
        })
        .build(app)?;
    Ok(())
}

/// Rebuilds the menu (language or pause state changed).
pub fn refresh(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Ok(menu) = build_menu(app) {
            let _ = tray.set_menu(Some(menu));
        }
        let lang = app.state::<AppState>().settings.read().language.clone();
        let _ = tray.set_tooltip(Some(t(&lang, "tray.tooltip", &[])));
    }
}
