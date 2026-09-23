//! Application error type.
//!
//! Errors are serialized to the frontend as `{ code, message }`. The frontend
//! translates `code` into a user-facing message; `message` is only shown in
//! developer contexts. Every error that crosses the IPC boundary is written to
//! the application log. Error messages never contain OCR text or image data.

use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Db(#[from] r2d2_sqlite::rusqlite::Error),
    #[error("database pool error: {0}")]
    Pool(#[from] r2d2::Error),
    #[error("file system error: {0}")]
    Io(#[from] std::io::Error),
    #[error("image error: {0}")]
    Image(#[from] image::ImageError),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("invalid input: {0}")]
    Invalid(String),
    #[error("unsupported image: {0}")]
    UnsupportedImage(String),
    #[error("capture failed: {0}")]
    Capture(String),
    #[error("ocr failed: {0}")]
    Ocr(String),
    #[error("ocr language unavailable: {0}")]
    OcrLanguage(String),
    #[error("clipboard error: {0}")]
    Clipboard(String),
    #[error("folder unavailable: {0}")]
    FolderUnavailable(String),
    #[error("shortcut error: {0}")]
    Shortcut(String),
    #[error("operation cancelled")]
    Cancelled,
    #[error("{0}")]
    Other(String),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Db(_) | AppError::Pool(_) => "database",
            AppError::Io(_) => "io",
            AppError::Image(_) | AppError::UnsupportedImage(_) => "image",
            AppError::NotFound(_) => "not_found",
            AppError::Invalid(_) => "invalid",
            AppError::Capture(_) => "capture",
            AppError::Ocr(_) => "ocr",
            AppError::OcrLanguage(_) => "ocr_language",
            AppError::Clipboard(_) => "clipboard",
            AppError::FolderUnavailable(_) => "folder_unavailable",
            AppError::Shortcut(_) => "shortcut",
            AppError::Cancelled => "cancelled",
            AppError::Other(_) => "unknown",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        if !matches!(self, AppError::Cancelled) {
            log::error!("[{}] {}", self.code(), self);
        }
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        AppError::Other(e.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
