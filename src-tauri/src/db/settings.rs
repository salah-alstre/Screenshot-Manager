//! Application settings stored as one JSON value per key.
//!
//! Unknown keys are ignored and missing keys fall back to defaults, so adding a
//! setting never needs a migration.

use std::collections::BTreeMap;

use r2d2_sqlite::rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::now_ms;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct GlobalHotkeys {
    pub region: String,
    pub window: String,
    pub fullscreen: String,
    pub open_app: String,
}

impl Default for GlobalHotkeys {
    fn default() -> Self {
        Self {
            region: "Ctrl+Shift+1".into(),
            window: "Ctrl+Shift+2".into(),
            fullscreen: "Ctrl+Shift+3".into(),
            open_app: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Keybindings {
    pub command_palette: String,
    pub search: String,
    pub favorite: String,
    pub edit: String,
    pub copy: String,
    pub delete: String,
    pub open: String,
    pub capture: String,
}

impl Default for Keybindings {
    fn default() -> Self {
        Self {
            command_palette: "Ctrl+K".into(),
            search: "Ctrl+F".into(),
            favorite: "F".into(),
            edit: "E".into(),
            copy: "Ctrl+C".into(),
            delete: "Delete".into(),
            open: "Enter".into(),
            capture: "Ctrl+N".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct NotificationSettings {
    pub capture: bool,
    pub ocr: bool,
    pub export: bool,
    pub import: bool,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self { capture: false, ocr: true, export: true, import: true }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    // General
    pub language: String,
    pub onboarding_completed: bool,
    pub launch_at_startup: bool,
    pub close_to_tray: bool,
    pub tray_hint_shown: bool,
    // Appearance
    pub theme: String,
    pub accent: String,
    pub ui_scale: f64,
    pub thumbnail_size: u32,
    pub animation: String,
    pub sidebar_style: String,
    pub library_view: String,
    pub library_sort: String,
    // Capture
    pub library_root: String,
    pub capture_action: String,
    pub show_capture_popup: bool,
    pub capture_cursor: bool,
    pub capture_delay: u32,
    pub fullscreen_target: String,
    pub image_format: String,
    pub image_quality: u8,
    // Shortcuts
    pub hotkeys: GlobalHotkeys,
    pub keybindings: Keybindings,
    // OCR
    pub ocr_enabled: bool,
    pub auto_ocr: bool,
    pub ocr_language: String,
    // Storage
    pub trash_auto_delete_days: u32,
    pub copy_dropped_files: bool,
    pub monitoring_paused: bool,
    // Notifications
    pub notifications: NotificationSettings,
    // Export
    pub export_format: String,
    pub export_quality: u8,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "en".into(),
            onboarding_completed: false,
            launch_at_startup: false,
            close_to_tray: true,
            tray_hint_shown: false,
            theme: "system".into(),
            accent: "blue".into(),
            ui_scale: 1.0,
            thumbnail_size: 220,
            animation: "full".into(),
            sidebar_style: "expanded".into(),
            library_view: "grid".into(),
            library_sort: "newest".into(),
            library_root: String::new(),
            capture_action: "save".into(),
            show_capture_popup: true,
            capture_cursor: false,
            capture_delay: 3,
            fullscreen_target: "cursor".into(),
            image_format: "png".into(),
            image_quality: 92,
            hotkeys: GlobalHotkeys::default(),
            keybindings: Keybindings::default(),
            ocr_enabled: true,
            auto_ocr: true,
            ocr_language: "auto".into(),
            trash_auto_delete_days: 0,
            copy_dropped_files: true,
            monitoring_paused: false,
            notifications: NotificationSettings::default(),
            export_format: "png".into(),
            export_quality: 90,
        }
    }
}

fn one_of(value: &str, allowed: &[&str], field: &str) -> AppResult<()> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(AppError::Invalid(format!("{field}: unsupported value")))
    }
}

impl Settings {
    pub fn validate(&self) -> AppResult<()> {
        one_of(&self.language, &["en", "ar"], "language")?;
        one_of(&self.theme, &["system", "light", "dark", "oled"], "theme")?;
        one_of(&self.accent, &["blue", "violet", "teal", "amber", "rose", "green"], "accent")?;
        one_of(&self.animation, &["full", "reduced", "off"], "animation")?;
        one_of(&self.sidebar_style, &["expanded", "compact"], "sidebarStyle")?;
        one_of(&self.library_view, &["grid", "large", "compact", "list"], "libraryView")?;
        one_of(&self.library_sort, &["newest", "oldest", "largest", "smallest", "name", "added"], "librarySort")?;
        one_of(&self.capture_action, &["save", "copy", "saveCopy", "editor"], "captureAction")?;
        one_of(&self.fullscreen_target, &["cursor", "primary", "all"], "fullscreenTarget")?;
        one_of(&self.image_format, &["png", "jpg", "webp"], "imageFormat")?;
        one_of(&self.export_format, &["png", "jpg", "webp"], "exportFormat")?;
        one_of(&self.ocr_language, &["auto", "en", "ar", "ar+en"], "ocrLanguage")?;
        if ![0, 7, 30, 60, 90].contains(&self.trash_auto_delete_days) {
            return Err(AppError::Invalid("trashAutoDeleteDays: unsupported value".into()));
        }
        if !(0.8..=1.4).contains(&self.ui_scale) {
            return Err(AppError::Invalid("uiScale out of range".into()));
        }
        if !(120..=420).contains(&self.thumbnail_size) {
            return Err(AppError::Invalid("thumbnailSize out of range".into()));
        }
        if self.capture_delay > 30 {
            return Err(AppError::Invalid("captureDelay out of range".into()));
        }
        if !(10..=100).contains(&self.image_quality) || !(10..=100).contains(&self.export_quality) {
            return Err(AppError::Invalid("quality out of range".into()));
        }
        Ok(())
    }
}

fn load_map(conn: &Connection) -> AppResult<Map<String, Value>> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    let mut map = Map::new();
    for row in rows {
        let (k, v) = row?;
        if let Ok(value) = serde_json::from_str::<Value>(&v) {
            map.insert(k, value);
        }
    }
    Ok(map)
}

pub fn load(conn: &Connection) -> AppResult<Settings> {
    let map = load_map(conn)?;
    // Deserialize field by field so a single corrupt value can't reset everything.
    let mut base = serde_json::to_value(Settings::default()).unwrap_or(Value::Null);
    if let Value::Object(ref mut obj) = base {
        for (k, v) in map {
            if obj.contains_key(&k) {
                let mut candidate = obj.clone();
                candidate.insert(k.clone(), v.clone());
                if serde_json::from_value::<Settings>(Value::Object(candidate)).is_ok() {
                    obj.insert(k, v);
                }
            }
        }
    }
    let settings: Settings = serde_json::from_value(base).unwrap_or_default();
    Ok(settings)
}

/// Merges `patch` (a partial settings object) into the stored settings.
/// Returns the new settings and the list of keys that actually changed.
pub fn update(conn: &Connection, patch: &Value) -> AppResult<(Settings, Vec<String>)> {
    let current = load(conn)?;
    let Value::Object(patch) = patch else {
        return Err(AppError::Invalid("settings patch must be an object".into()));
    };
    let mut merged = serde_json::to_value(&current).map_err(|e| AppError::Other(e.to_string()))?;
    let obj = merged.as_object_mut().expect("settings serialize to an object");
    for (k, v) in patch {
        if !obj.contains_key(k) {
            return Err(AppError::Invalid(format!("unknown setting {k}")));
        }
        // Nested objects (hotkeys, keybindings, notifications) merge shallowly.
        match (obj.get_mut(k), v) {
            (Some(Value::Object(existing)), Value::Object(inner)) => {
                for (ik, iv) in inner {
                    existing.insert(ik.clone(), iv.clone());
                }
            }
            _ => {
                obj.insert(k.clone(), v.clone());
            }
        }
    }
    let next: Settings = serde_json::from_value(merged.clone()).map_err(|e| AppError::Invalid(e.to_string()))?;
    next.validate()?;

    let old = serde_json::to_value(&current).unwrap_or(Value::Null);
    let old_obj: BTreeMap<String, Value> = serde_json::from_value(old).unwrap_or_default();
    let new_obj: BTreeMap<String, Value> = serde_json::from_value(merged).unwrap_or_default();
    let mut changed = Vec::new();
    let now = now_ms();
    for (k, v) in &new_obj {
        if old_obj.get(k) != Some(v) {
            conn.execute(
                "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                params![k, v.to_string(), now],
            )?;
            changed.push(k.clone());
        }
    }
    Ok((next, changed))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_memory;
    use serde_json::json;

    #[test]
    fn defaults_when_empty() {
        let conn = open_memory().unwrap();
        let s = load(&conn).unwrap();
        assert_eq!(s, Settings::default());
        assert_eq!(s.trash_auto_delete_days, 0, "trash auto-delete defaults to never");
        assert!(!s.launch_at_startup, "startup launch is off by default");
    }

    #[test]
    fn update_persists_and_reports_changes() {
        let conn = open_memory().unwrap();
        let (s, changed) = update(&conn, &json!({ "language": "ar", "theme": "dark" })).unwrap();
        assert_eq!(s.language, "ar");
        assert_eq!(changed.len(), 2);
        let reloaded = load(&conn).unwrap();
        assert_eq!(reloaded.language, "ar");
        assert_eq!(reloaded.theme, "dark");
        let (_, changed) = update(&conn, &json!({ "language": "ar" })).unwrap();
        assert!(changed.is_empty());
    }

    #[test]
    fn nested_objects_merge() {
        let conn = open_memory().unwrap();
        let (s, _) = update(&conn, &json!({ "hotkeys": { "region": "Ctrl+Alt+R" } })).unwrap();
        assert_eq!(s.hotkeys.region, "Ctrl+Alt+R");
        assert_eq!(s.hotkeys.window, GlobalHotkeys::default().window);
    }

    #[test]
    fn rejects_invalid_values_and_unknown_keys() {
        let conn = open_memory().unwrap();
        assert!(update(&conn, &json!({ "language": "fr" })).is_err());
        assert!(update(&conn, &json!({ "uiScale": 3.0 })).is_err());
        assert!(update(&conn, &json!({ "trashAutoDeleteDays": 5 })).is_err());
        assert!(update(&conn, &json!({ "evil": true })).is_err());
        assert_eq!(load(&conn).unwrap(), Settings::default());
    }

    #[test]
    fn corrupt_value_falls_back_to_default() {
        let conn = open_memory().unwrap();
        conn.execute("INSERT INTO settings (key, value, updated_at) VALUES ('theme', '42', 0)", []).unwrap();
        conn.execute("INSERT INTO settings (key, value, updated_at) VALUES ('language', '\"ar\"', 0)", []).unwrap();
        let s = load(&conn).unwrap();
        assert_eq!(s.theme, "system");
        assert_eq!(s.language, "ar");
    }
}
