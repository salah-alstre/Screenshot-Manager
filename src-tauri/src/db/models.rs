//! Data transfer types shared with the frontend (camelCase JSON).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotSummary {
    pub id: i64,
    pub name: String,
    pub format: String,
    pub width: i64,
    pub height: i64,
    pub file_size: i64,
    pub captured_at: i64,
    pub imported_at: i64,
    pub updated_at: i64,
    pub is_favorite: bool,
    pub collection_id: Option<i64>,
    pub ocr_status: String,
    pub has_note: bool,
    pub has_edit: bool,
    pub missing: bool,
    pub trashed_at: Option<i64>,
    pub tag_ids: Vec<i64>,
    /// Incremented whenever the image pixels change (edit, revert, replace).
    pub image_version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrWord {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrInfo {
    pub text: String,
    pub language: String,
    pub engine: String,
    pub edited: bool,
    pub updated_at: i64,
    pub words: Vec<OcrWord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotDetail {
    #[serde(flatten)]
    pub summary: ScreenshotSummary,
    pub file_path: String,
    pub edited_path: Option<String>,
    pub file_exists: bool,
    pub sha256: String,
    pub source: String,
    pub capture_mode: Option<String>,
    pub source_monitor: Option<String>,
    pub file_created_at: Option<i64>,
    pub file_modified_at: Option<i64>,
    pub note: String,
    pub ocr: Option<OcrInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: i64,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub count: i64,
    pub total_size: i64,
    pub cover_ids: Vec<i64>,
    pub last_added_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub created_at: i64,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchedFolder {
    pub id: i64,
    pub path: String,
    pub enabled: bool,
    pub available: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub offset: i64,
}

/// Row inserted for a new screenshot.
#[derive(Debug, Clone)]
pub struct NewScreenshot {
    pub file_path: String,
    pub name: String,
    pub format: String,
    pub width: i64,
    pub height: i64,
    pub file_size: i64,
    pub sha256: String,
    pub phash: Option<Vec<u8>>,
    pub source: String,
    pub capture_mode: Option<String>,
    pub source_monitor: Option<String>,
    pub owned: bool,
    pub captured_at: i64,
    pub file_created_at: Option<i64>,
    pub file_modified_at: Option<i64>,
    pub collection_id: Option<i64>,
}

/// Minimal file information for a screenshot, used by file operations.
#[derive(Debug, Clone)]
pub struct FileRef {
    pub id: i64,
    pub file_path: String,
    pub edited_path: Option<String>,
    pub owned: bool,
    pub name: String,
    pub format: String,
}

impl FileRef {
    /// The file that represents the current state (edited version if any).
    pub fn current_path(&self) -> &str {
        self.edited_path.as_deref().unwrap_or(&self.file_path)
    }
}
