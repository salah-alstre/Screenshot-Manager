//! Clipboard access.

use std::borrow::Cow;

use image::RgbaImage;

use crate::error::{AppError, AppResult};

pub fn copy_image(img: &RgbaImage) -> AppResult<()> {
    let mut cb = arboard::Clipboard::new().map_err(|e| AppError::Clipboard(e.to_string()))?;
    cb.set_image(arboard::ImageData {
        width: img.width() as usize,
        height: img.height() as usize,
        bytes: Cow::Borrowed(img.as_raw()),
    })
    .map_err(|e| AppError::Clipboard(e.to_string()))
}

pub fn copy_text(text: &str) -> AppResult<()> {
    let mut cb = arboard::Clipboard::new().map_err(|e| AppError::Clipboard(e.to_string()))?;
    cb.set_text(text.to_string()).map_err(|e| AppError::Clipboard(e.to_string()))
}
