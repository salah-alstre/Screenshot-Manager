//! Operations that touch both the file system and the database. Each one is
//! ordered so a failure never leaves a database row pointing at a file we
//! deleted, and never deletes user files irrecoverably: files removed by
//! SnapVault always go to the Windows Recycle Bin.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use chrono::{DateTime, Local, TimeZone};
use image::{DynamicImage, RgbaImage};
use rayon::prelude::*;
use tauri::{AppHandle, Manager};

use super::imaging;
use super::paths::{self, has_supported_extension};
use crate::db::models::NewScreenshot;
use crate::db::{now_ms, screenshots, tags};
use crate::error::{AppError, AppResult};
use crate::events::{self, ImportReport};
use crate::state::AppState;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ImportMode {
    /// Copy the file into the library folder (drag and drop, manual import).
    Copy,
    /// Reference the file where it is (watched folders).
    Reference,
}

#[derive(Debug, PartialEq)]
pub enum ImportOutcome {
    Imported(i64),
    Duplicate(i64),
}

struct Prepared {
    path: PathBuf,
    bytes: Vec<u8>,
    format: &'static str,
    img: DynamicImage,
    sha: String,
    phash: Vec<u8>,
    created: Option<i64>,
    modified: Option<i64>,
}

fn file_times(path: &Path) -> (Option<i64>, Option<i64>) {
    let Ok(meta) = std::fs::metadata(path) else { return (None, None) };
    let to_ms = |t: std::io::Result<std::time::SystemTime>| {
        t.ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64)
    };
    (to_ms(meta.created()), to_ms(meta.modified()))
}

fn prepare(path: &Path) -> AppResult<Prepared> {
    if !has_supported_extension(path) {
        return Err(AppError::UnsupportedImage("unsupported extension".into()));
    }
    let (bytes, format, img) = imaging::load_validated(path)?;
    let sha = imaging::sha256_hex(&bytes);
    let phash = imaging::dhash256(&img);
    let (created, modified) = file_times(path);
    Ok(Prepared {
        path: path.to_path_buf(),
        bytes,
        format: imaging::format_name(format),
        img,
        sha,
        phash,
        created,
        modified,
    })
}

fn local_time(ms: i64) -> DateTime<Local> {
    Local.timestamp_millis_opt(ms).single().unwrap_or_else(Local::now)
}

fn commit(state: &AppState, p: Prepared, mode: ImportMode, source: &str) -> AppResult<ImportOutcome> {
    let path_str = p.path.to_string_lossy().to_string();
    {
        let conn = state.pool.get()?;
        if let Some(id) = screenshots::find_by_path(&conn, &path_str)? {
            return Ok(ImportOutcome::Duplicate(id));
        }
        if let Some(id) = screenshots::find_by_sha(&conn, &p.sha)? {
            return Ok(ImportOutcome::Duplicate(id));
        }
    }
    let captured_at = p.modified.or(p.created).unwrap_or_else(now_ms);
    let stem = p.path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "Image".into());

    let (final_path, owned) = match mode {
        ImportMode::Reference => (p.path.clone(), false),
        ImportMode::Copy => {
            let dir = paths::dated_dir(&state.library_root(), local_time(captured_at));
            std::fs::create_dir_all(&dir).map_err(|_| AppError::FolderUnavailable(dir.display().to_string()))?;
            let ext = paths::extension_of(&p.path).unwrap_or_else(|| p.format.to_string());
            let dest = paths::unique_path(&dir, &stem, &ext);
            paths::write_atomic(&dest, &p.bytes)?;
            (dest, true)
        }
    };

    let row = NewScreenshot {
        file_path: final_path.to_string_lossy().to_string(),
        name: stem,
        format: p.format.into(),
        width: p.img.width() as i64,
        height: p.img.height() as i64,
        file_size: p.bytes.len() as i64,
        sha256: p.sha,
        phash: Some(p.phash),
        source: source.into(),
        capture_mode: None,
        source_monitor: None,
        owned,
        captured_at,
        file_created_at: p.created,
        file_modified_at: p.modified,
        collection_id: None,
    };
    let inserted = (|| {
        let conn = state.pool.get()?;
        screenshots::insert(&conn, &row)
    })();
    let id = match inserted {
        Ok(id) => id,
        Err(e) => {
            // Only remove a copy we just created; never the user's source file.
            if owned {
                let _ = std::fs::remove_file(&final_path);
            }
            return Err(e);
        }
    };
    if let Err(e) = imaging::write_thumbnail(&p.img, &state.paths.thumb_path(id)) {
        log::warn!("thumbnail for {id} failed: {e}");
    }
    Ok(ImportOutcome::Imported(id))
}

/// Imports files in the background with progress. Returns the report.
pub fn import_paths(app: &AppHandle, files: Vec<PathBuf>, mode: ImportMode, source: &str) -> ImportReport {
    let state = app.state::<AppState>();
    let files: Vec<PathBuf> = files.into_iter().filter(|p| p.is_file() && has_supported_extension(p)).collect();
    let mut report = ImportReport { imported: 0, duplicates: 0, failed: 0, first_id: None };
    if files.is_empty() {
        return report;
    }
    let task = state.tasks.start(app, "import", files.len() as u64, None);
    let mut imported_ids = Vec::new();
    let mut done = 0u64;
    for chunk in files.chunks(8) {
        if task.is_cancelled() {
            break;
        }
        let prepared: Vec<(PathBuf, AppResult<Prepared>)> =
            chunk.par_iter().map(|p| (p.clone(), prepare(p))).collect();
        for (path, prep) in prepared {
            match prep.and_then(|p| commit(&state, p, mode, source)) {
                Ok(ImportOutcome::Imported(id)) => {
                    report.imported += 1;
                    report.first_id.get_or_insert(id);
                    imported_ids.push(id);
                }
                Ok(ImportOutcome::Duplicate(_)) => report.duplicates += 1,
                Err(e) => {
                    report.failed += 1;
                    log::warn!("import failed for {}: [{}] {e}", path.display(), e.code());
                }
            }
            done += 1;
        }
        task.set_progress(done, files.len() as u64);
    }
    task.finish(if task.is_cancelled() { "cancelled" } else { "done" });
    if !imported_ids.is_empty() {
        events::library_changed(app);
        let (ocr_enabled, auto) = {
            let s = state.settings.read();
            (s.ocr_enabled, s.auto_ocr)
        };
        if ocr_enabled && auto {
            state.ocr.enqueue(app, &imported_ids);
        }
    }
    report
}

/// Collects supported image files directly inside `dir` (non-recursive).
pub fn images_in_dir(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else { return vec![] };
    entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file() && has_supported_extension(p))
        .collect()
}

/// Metadata attached to a newly captured screenshot.
pub struct CaptureMeta {
    pub mode: String,
    pub monitor: Option<String>,
}

/// Saves a captured image into the library and returns its id.
pub fn save_capture(state: &AppState, img: &RgbaImage, meta: &CaptureMeta) -> AppResult<i64> {
    let (format, quality) = {
        let s = state.settings.read();
        (s.image_format.clone(), s.image_quality)
    };
    let now = Local::now();
    let dynimg = DynamicImage::ImageRgba8(img.clone());
    let bytes = imaging::encode(&dynimg, &format, quality)?;
    let dir = paths::dated_dir(&state.library_root(), now);
    std::fs::create_dir_all(&dir).map_err(|_| AppError::FolderUnavailable(dir.display().to_string()))?;
    let stem = paths::capture_file_stem(now);
    let path = paths::unique_path(&dir, &stem, &format);
    paths::write_atomic(&path, &bytes)?;
    let name = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or(stem);
    let ms = now.timestamp_millis();
    let row = NewScreenshot {
        file_path: path.to_string_lossy().to_string(),
        name,
        format: if format == "jpeg" { "jpg".into() } else { format },
        width: img.width() as i64,
        height: img.height() as i64,
        file_size: bytes.len() as i64,
        sha256: imaging::sha256_hex(&bytes),
        phash: Some(imaging::dhash256(&dynimg)),
        source: "capture".into(),
        capture_mode: Some(meta.mode.clone()),
        source_monitor: meta.monitor.clone(),
        owned: true,
        captured_at: ms,
        file_created_at: Some(ms),
        file_modified_at: Some(ms),
        collection_id: None,
    };
    // The file is kept even if the insert fails, so a capture is never lost.
    let id = {
        let conn = state.pool.get()?;
        screenshots::insert(&conn, &row)?
    };
    if let Err(e) = imaging::write_thumbnail(&dynimg, &state.paths.thumb_path(id)) {
        log::warn!("thumbnail for {id} failed: {e}");
    }
    Ok(id)
}

/// Returns the thumbnail path, generating it if missing.
pub fn ensure_thumbnail(state: &AppState, id: i64) -> AppResult<PathBuf> {
    let thumb = state.paths.thumb_path(id);
    if thumb.is_file() {
        return Ok(thumb);
    }
    let file = {
        let conn = state.pool.get()?;
        screenshots::file_ref(&conn, id)?
    };
    let path = PathBuf::from(file.current_path());
    let img = match imaging::open_image(&path) {
        Ok(img) => img,
        Err(e) => {
            if !path.exists() {
                if let Ok(conn) = state.pool.get() {
                    let _ = screenshots::set_missing(&conn, id, true);
                }
            }
            return Err(e);
        }
    };
    imaging::write_thumbnail(&img, &thumb)?;
    Ok(thumb)
}

pub fn invalidate_thumbnail(state: &AppState, id: i64) {
    let _ = std::fs::remove_file(state.paths.thumb_path(id));
}

fn recycle(path: &Path) -> AppResult<()> {
    if !path.exists() {
        return Ok(());
    }
    trash::delete(path).map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))
}

/// Permanently removes screenshots from SnapVault. Their files are moved to the
/// Windows Recycle Bin (never hard-deleted). Rows are removed only after the
/// files were recycled successfully.
pub fn delete_permanently(state: &AppState, ids: &[i64]) -> AppResult<usize> {
    let mut removed = 0;
    for &id in ids {
        let mut conn = state.pool.get()?;
        let file = screenshots::file_ref(&conn, id)?;
        let tx = conn.transaction()?;
        screenshots::delete_rows(&tx, &[id])?;
        if let Some(edited) = &file.edited_path {
            recycle(Path::new(edited))?;
        }
        recycle(Path::new(&file.file_path))?;
        tx.commit()?;
        invalidate_thumbnail(state, id);
        removed += 1;
    }
    Ok(removed)
}

/// Renames the screenshot and its file on disk (same folder, same extension).
pub fn rename(state: &AppState, id: i64, new_name: &str) -> AppResult<()> {
    let name = paths::sanitize_file_stem(new_name)?;
    let conn = state.pool.get()?;
    let file = screenshots::file_ref(&conn, id)?;
    let old = PathBuf::from(&file.file_path);
    let dir = old.parent().ok_or_else(|| AppError::Invalid("file has no folder".into()))?;
    let ext = paths::extension_of(&old).unwrap_or_else(|| file.format.clone());
    let new_path = dir.join(format!("{name}.{ext}"));
    if new_path == old {
        return screenshots::rename(&conn, id, &name, None);
    }
    let case_only = new_path.to_string_lossy().eq_ignore_ascii_case(&old.to_string_lossy());
    if new_path.exists() && !case_only {
        return Err(AppError::Invalid("name_exists".into()));
    }
    if old.exists() {
        std::fs::rename(&old, &new_path)?;
    }
    if let Err(e) = screenshots::rename(&conn, id, &name, Some(&new_path.to_string_lossy())) {
        if new_path.exists() {
            let _ = std::fs::rename(&new_path, &old);
        }
        return Err(e);
    }
    Ok(())
}

/// How an edited image should be stored.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EditMode {
    /// Keep the original; store the edit alongside it.
    KeepOriginal,
    /// Store the edit as a brand-new screenshot.
    Copy,
    /// Replace the original (the original goes to the Recycle Bin).
    Replace,
}

/// Saves editor output (PNG bytes). Returns the id of the screenshot holding the edit.
pub fn save_edit(app: &AppHandle, id: i64, png: &[u8], mode: EditMode) -> AppResult<i64> {
    let state = app.state::<AppState>();
    if image::guess_format(png).ok() != Some(image::ImageFormat::Png) {
        return Err(AppError::UnsupportedImage("editor output must be PNG".into()));
    }
    let img = imaging::decode(png, image::ImageFormat::Png)?;
    let file = {
        let conn = state.pool.get()?;
        screenshots::file_ref(&conn, id)?
    };
    let now = Local::now();
    let target_id = match mode {
        EditMode::Copy => {
            let dir = paths::dated_dir(&state.library_root(), now);
            std::fs::create_dir_all(&dir)?;
            let dest = paths::unique_path(&dir, &format!("{} (edited)", file.name), "png");
            paths::write_atomic(&dest, png)?;
            let row = NewScreenshot {
                file_path: dest.to_string_lossy().to_string(),
                name: dest.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default(),
                format: "png".into(),
                width: img.width() as i64,
                height: img.height() as i64,
                file_size: png.len() as i64,
                sha256: imaging::sha256_hex(png),
                phash: Some(imaging::dhash256(&img)),
                source: "edit".into(),
                capture_mode: None,
                source_monitor: None,
                owned: true,
                captured_at: now.timestamp_millis(),
                file_created_at: Some(now.timestamp_millis()),
                file_modified_at: Some(now.timestamp_millis()),
                collection_id: screenshots::summary(&*state.pool.get()?, id)?.collection_id,
            };
            let conn = state.pool.get()?;
            let new_id = match screenshots::insert(&conn, &row) {
                Ok(new_id) => new_id,
                Err(e) => {
                    let _ = std::fs::remove_file(&dest);
                    return Err(e);
                }
            };
            // Carry tags over to the copy.
            for tag_id in screenshots::summary(&conn, id)?.tag_ids {
                tags::add_to(&conn, &[new_id], tag_id)?;
            }
            new_id
        }
        EditMode::KeepOriginal | EditMode::Replace => {
            let dir = paths::edited_dir(&state.library_root(), now);
            std::fs::create_dir_all(&dir)?;
            let dest = paths::unique_path(&dir, &format!("{} (edited)", file.name), "png");
            paths::write_atomic(&dest, png)?;
            let dest_str = dest.to_string_lossy().to_string();
            let conn = state.pool.get()?;
            let update = if mode == EditMode::KeepOriginal {
                screenshots::set_edited(&conn, id, Some(&dest_str), img.width() as i64, img.height() as i64, png.len() as i64)
            } else {
                conn.execute(
                    "UPDATE screenshots SET file_path = ?1, edited_path = NULL, format = 'png', owned = 1,
                        width = ?2, height = ?3, file_size = ?4, sha256 = ?5, phash = ?6, updated_at = ?7,
                        image_version = image_version + 1 WHERE id = ?8",
                    r2d2_sqlite::rusqlite::params![
                        dest_str,
                        img.width() as i64,
                        img.height() as i64,
                        png.len() as i64,
                        imaging::sha256_hex(png),
                        imaging::dhash256(&img),
                        now_ms(),
                        id
                    ],
                )
                .map(|_| ())
                .map_err(AppError::from)
            };
            if let Err(e) = update {
                let _ = std::fs::remove_file(&dest);
                return Err(e);
            }
            // The previous edit (and for Replace, the original) go to the Recycle Bin.
            if let Some(prev) = &file.edited_path {
                if let Err(e) = recycle(Path::new(prev)) {
                    log::warn!("could not recycle previous edit: {e}");
                }
            }
            if mode == EditMode::Replace {
                if let Err(e) = recycle(Path::new(&file.file_path)) {
                    log::warn!("could not recycle original: {e}");
                }
            }
            id
        }
    };
    invalidate_thumbnail(&state, target_id);
    let _ = imaging::write_thumbnail(&img, &state.paths.thumb_path(target_id));

    // Extracted text of the old image may contain details that were just redacted.
    // Drop it and re-run OCR on the edited image.
    {
        let conn = state.pool.get()?;
        conn.execute("DELETE FROM ocr_data WHERE screenshot_id = ?1", [target_id])?;
        screenshots::set_ocr_status(&conn, target_id, "none")?;
        crate::db::search::reindex(&conn, target_id)?;
    }
    if state.settings.read().ocr_enabled {
        state.ocr.enqueue(app, &[target_id]);
    }
    events::library_changed(app);
    events::screenshots_updated(app, &[target_id]);
    Ok(target_id)
}

/// Removes the edited version and returns to the original file.
pub fn revert_edit(app: &AppHandle, id: i64) -> AppResult<()> {
    let state = app.state::<AppState>();
    let file = {
        let conn = state.pool.get()?;
        screenshots::file_ref(&conn, id)?
    };
    let Some(edited) = file.edited_path.clone() else { return Ok(()) };
    let original = Path::new(&file.file_path);
    let (w, h, size) = match image::image_dimensions(original) {
        Ok((w, h)) => (w as i64, h as i64, std::fs::metadata(original).map(|m| m.len() as i64).unwrap_or(0)),
        Err(_) => return Err(AppError::NotFound("original file".into())),
    };
    {
        let conn = state.pool.get()?;
        screenshots::set_edited(&conn, id, None, w, h, size)?;
        conn.execute("DELETE FROM ocr_data WHERE screenshot_id = ?1", [id])?;
        screenshots::set_ocr_status(&conn, id, "none")?;
        crate::db::search::reindex(&conn, id)?;
    }
    if let Err(e) = recycle(Path::new(&edited)) {
        log::warn!("could not recycle edited file: {e}");
    }
    invalidate_thumbnail(&state, id);
    if state.settings.read().ocr_enabled {
        state.ocr.enqueue(app, &[id]);
    }
    events::screenshots_updated(app, &[id]);
    Ok(())
}

/// Loads the current image of a screenshot as RGBA.
pub fn load_rgba(state: &AppState, id: i64) -> AppResult<RgbaImage> {
    let file = {
        let conn = state.pool.get()?;
        screenshots::file_ref(&conn, id)?
    };
    Ok(imaging::open_image(Path::new(file.current_path()))?.to_rgba8())
}
