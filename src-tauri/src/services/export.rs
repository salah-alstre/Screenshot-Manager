//! Exporting screenshots to PNG, JPG or WEBP.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use super::{imaging, paths};
use crate::db::screenshots;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub fn normalize_format(format: &str) -> AppResult<&'static str> {
    match format {
        "png" => Ok("png"),
        "jpg" | "jpeg" => Ok("jpg"),
        "webp" => Ok("webp"),
        _ => Err(AppError::Invalid(format!("unsupported export format {format}"))),
    }
}

/// Exports one screenshot to an exact destination path (chosen in a save dialog).
pub fn export_to(state: &AppState, id: i64, dest: &Path, format: &str, quality: u8) -> AppResult<()> {
    let format = normalize_format(format)?;
    let file = {
        let conn = state.pool.get()?;
        screenshots::file_ref(&conn, id)?
    };
    let img = imaging::open_image(Path::new(file.current_path()))?;
    let bytes = imaging::encode(&img, format, quality)?;
    paths::write_atomic(dest, &bytes)
}

/// Exports many screenshots into a folder with unique file names.
/// Runs as a cancellable background task; returns (exported, failed).
pub fn export_many(app: &AppHandle, ids: &[i64], dir: &Path, format: &str, quality: u8) -> AppResult<(usize, usize)> {
    let format = normalize_format(format)?;
    if !dir.is_dir() {
        return Err(AppError::FolderUnavailable(dir.display().to_string()));
    }
    let state = app.state::<AppState>();
    let task = state.tasks.start(app, "export", ids.len() as u64, None);
    let (mut ok, mut failed) = (0usize, 0usize);
    for (i, &id) in ids.iter().enumerate() {
        if task.is_cancelled() {
            break;
        }
        let result = (|| {
            let file = {
                let conn = state.pool.get()?;
                screenshots::file_ref(&conn, id)?
            };
            let img = imaging::open_image(Path::new(file.current_path()))?;
            let bytes = imaging::encode(&img, format, quality)?;
            let stem = paths::sanitize_file_stem(&file.name).unwrap_or_else(|_| format!("Screenshot {id}"));
            let dest: PathBuf = paths::unique_path(dir, &stem, format);
            paths::write_atomic(&dest, &bytes)
        })();
        match result {
            Ok(()) => ok += 1,
            Err(e) => {
                failed += 1;
                log::warn!("export of {id} failed: [{}] {e}", e.code());
            }
        }
        task.set_progress(i as u64 + 1, ids.len() as u64);
    }
    task.finish(if task.is_cancelled() { "cancelled" } else if failed > 0 && ok == 0 { "failed" } else { "done" });
    Ok((ok, failed))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_formats() {
        assert_eq!(normalize_format("jpeg").unwrap(), "jpg");
        assert_eq!(normalize_format("webp").unwrap(), "webp");
        assert!(normalize_format("tiff").is_err());
        assert!(normalize_format("../png").is_err());
    }
}
