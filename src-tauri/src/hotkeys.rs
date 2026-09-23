//! Global (system-wide) capture shortcuts.

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::db::settings::GlobalHotkeys;
use crate::services::capture::{self, CaptureKind};
use crate::state::AppState;

/// Converts "Ctrl+Shift+1" into the plugin's accelerator syntax.
pub fn to_accelerator(s: &str) -> String {
    s.split('+')
        .map(|p| match p.trim() {
            "Ctrl" => "Control".to_string(),
            "Win" => "Super".to_string(),
            other => other.to_string(),
        })
        .collect::<Vec<_>>()
        .join("+")
}

pub fn parse(s: &str) -> Option<Shortcut> {
    if s.trim().is_empty() {
        return None;
    }
    to_accelerator(s).parse::<Shortcut>().ok()
}

/// Handler installed on the global-shortcut plugin.
pub fn on_shortcut(app: &AppHandle, shortcut: &Shortcut, state: ShortcutState) {
    if state != ShortcutState::Pressed {
        return;
    }
    let action = {
        let st = app.state::<AppState>();
        let map = st.hotkeys.lock();
        map.iter().find(|(s, _)| parse(s).as_ref() == Some(shortcut)).map(|(_, a)| a.clone())
    };
    match action.as_deref() {
        Some("region") => capture::start(app, CaptureKind::Region, None, false),
        Some("window") => capture::start(app, CaptureKind::ActiveWindow, None, false),
        Some("fullscreen") => capture::start(app, CaptureKind::Fullscreen, None, false),
        Some("openApp") => crate::show_main_window(app),
        _ => {}
    }
}

/// Unregisters everything and registers the configured shortcuts.
/// Returns the actions whose shortcut could not be registered.
pub fn register_all(app: &AppHandle, keys: &GlobalHotkeys) -> Vec<String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let state = app.state::<AppState>();
    let mut map = state.hotkeys.lock();
    map.clear();
    let mut failed = Vec::new();
    for (action, key) in [
        ("region", &keys.region),
        ("window", &keys.window),
        ("fullscreen", &keys.fullscreen),
        ("openApp", &keys.open_app),
    ] {
        let Some(sc) = parse(key) else {
            if !key.trim().is_empty() {
                failed.push(action.to_string());
            }
            continue;
        };
        match gs.register(sc) {
            Ok(()) => map.push((key.clone(), action.to_string())),
            Err(e) => {
                log::warn!("global shortcut for {action} unavailable: {e}");
                failed.push(action.to_string());
            }
        }
    }
    failed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_default_shortcuts() {
        for s in ["Ctrl+Shift+1", "Ctrl+Shift+2", "Ctrl+Shift+3", "Alt+PrintScreen", "Ctrl+Alt+S", "Win+Shift+A"] {
            assert!(parse(s).is_some(), "{s} should parse");
        }
        assert!(parse("").is_none());
        assert!(parse("Ctrl+Nope+Zz").is_none());
    }
}
