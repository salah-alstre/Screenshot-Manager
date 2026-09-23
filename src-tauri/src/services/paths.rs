//! File-system layout and path safety helpers.
//!
//! Library layout:
//! ```text
//! <library root>/            (default: Pictures\SnapVault)
//!   Screenshots/YYYY/MM/DD/  captured and imported originals
//!   Edited/YYYY/MM/          edited versions (originals are never overwritten)
//! ```
//! Application data (database, thumbnails, logs) lives in the per-user app data
//! directory and never inside the library.

use std::path::{Component, Path, PathBuf};

use chrono::{DateTime, Datelike, Local};

use crate::error::{AppError, AppResult};

pub const SUPPORTED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "bmp"];

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    pub thumbs_dir: PathBuf,
    pub logs_dir: PathBuf,
    pub default_library_root: PathBuf,
}

impl AppPaths {
    pub fn new(data_dir: PathBuf, logs_dir: PathBuf, pictures_dir: PathBuf) -> AppResult<Self> {
        let thumbs_dir = data_dir.join("thumbnails");
        std::fs::create_dir_all(&data_dir)?;
        std::fs::create_dir_all(&thumbs_dir)?;
        std::fs::create_dir_all(&logs_dir)?;
        Ok(Self {
            db_path: data_dir.join("snapvault.db"),
            thumbs_dir,
            logs_dir,
            default_library_root: pictures_dir.join("SnapVault"),
            data_dir,
        })
    }

    pub fn thumb_path(&self, id: i64) -> PathBuf {
        self.thumbs_dir.join(format!("{:02x}", id % 256)).join(format!("{id}.jpg"))
    }
}

pub fn library_root(configured: &str, paths: &AppPaths) -> PathBuf {
    if configured.trim().is_empty() {
        paths.default_library_root.clone()
    } else {
        PathBuf::from(configured)
    }
}

pub fn dated_dir(root: &Path, when: DateTime<Local>) -> PathBuf {
    root.join("Screenshots")
        .join(format!("{:04}", when.year()))
        .join(format!("{:02}", when.month()))
        .join(format!("{:02}", when.day()))
}

pub fn edited_dir(root: &Path, when: DateTime<Local>) -> PathBuf {
    root.join("Edited").join(format!("{:04}", when.year())).join(format!("{:02}", when.month()))
}

pub fn capture_file_stem(when: DateTime<Local>) -> String {
    when.format("SnapVault %Y-%m-%d %H-%M-%S").to_string()
}

/// Returns `dir/stem.ext`, appending ` (2)`, ` (3)`, … if the name is taken.
pub fn unique_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let first = dir.join(format!("{stem}.{ext}"));
    if !first.exists() {
        return first;
    }
    for n in 2..10_000 {
        let candidate = dir.join(format!("{stem} ({n}).{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!("{stem} {}.{ext}", crate::db::now_ms()))
}

const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1",
    "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Validates a user-supplied file name (without extension) for use on Windows.
/// Rejects separators, traversal, reserved device names and invalid characters.
pub fn sanitize_file_stem(name: &str) -> AppResult<String> {
    let name = name.trim().trim_end_matches(['.', ' ']);
    if name.is_empty() {
        return Err(AppError::Invalid("name_required".into()));
    }
    if name.chars().count() > 150 {
        return Err(AppError::Invalid("name_too_long".into()));
    }
    if name == "." || name == ".." || name.contains("..") {
        return Err(AppError::Invalid("name_invalid".into()));
    }
    if name.chars().any(|c| matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || c.is_control()) {
        return Err(AppError::Invalid("name_invalid".into()));
    }
    let upper = name.to_ascii_uppercase();
    let base = upper.split('.').next().unwrap_or("");
    if RESERVED.contains(&base) {
        return Err(AppError::Invalid("name_invalid".into()));
    }
    Ok(name.to_string())
}

pub fn extension_of(path: &Path) -> Option<String> {
    path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase())
}

pub fn has_supported_extension(path: &Path) -> bool {
    extension_of(path).is_some_and(|e| SUPPORTED_EXTENSIONS.contains(&e.as_str()))
}

/// True if `path` resolves to a location inside `base` (both must exist).
pub fn is_within(base: &Path, path: &Path) -> bool {
    match (dunce_canonicalize(base), dunce_canonicalize(path)) {
        (Some(b), Some(p)) => p.starts_with(b),
        _ => false,
    }
}

/// Lexical check that a relative path has no parent/root components.
pub fn is_safe_relative(path: &Path) -> bool {
    path.components().all(|c| matches!(c, Component::Normal(_)))
}

fn dunce_canonicalize(p: &Path) -> Option<PathBuf> {
    let c = std::fs::canonicalize(p).ok()?;
    // Strip the \\?\ verbatim prefix so prefix comparisons are consistent.
    let s = c.to_string_lossy();
    Some(PathBuf::from(s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()))
}

/// Writes bytes to `path` atomically (temp file + rename) and creates parent dirs.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let dir = path.parent().ok_or_else(|| AppError::Invalid("path has no parent".into()))?;
    std::fs::create_dir_all(dir)?;
    let tmp = dir.join(format!(
        ".{}.svtmp",
        path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
    ));
    std::fs::write(&tmp, bytes)?;
    if let Err(e) = std::fs::rename(&tmp, path) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_names() {
        assert_eq!(sanitize_file_stem("  Bug report ").unwrap(), "Bug report");
        assert_eq!(sanitize_file_stem("خطأ في البناء").unwrap(), "خطأ في البناء");
        for bad in ["", "   ", "..", "../evil", "a/b", "a\\b", "C:evil", "con", "LPT1", "nul.txt", "a*b", "a\u{0007}"] {
            assert!(sanitize_file_stem(bad).is_err(), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn supported_extensions() {
        assert!(has_supported_extension(Path::new("a.PNG")));
        assert!(has_supported_extension(Path::new("a.jpeg")));
        assert!(!has_supported_extension(Path::new("a.exe")));
        assert!(!has_supported_extension(Path::new("a.png.exe")));
        assert!(!has_supported_extension(Path::new("noext")));
    }

    #[test]
    fn detects_traversal() {
        assert!(is_safe_relative(Path::new("2026/09/a.png")));
        assert!(!is_safe_relative(Path::new("../a.png")));
        assert!(!is_safe_relative(Path::new("/abs/a.png")));
    }

    #[test]
    fn within_checks_real_paths() {
        let dir = tempfile::tempdir().unwrap();
        let inner = dir.path().join("x");
        std::fs::create_dir_all(&inner).unwrap();
        assert!(is_within(dir.path(), &inner));
        assert!(!is_within(&inner, dir.path()));
        assert!(!is_within(dir.path(), &dir.path().join("missing")));
    }

    #[test]
    fn unique_paths_do_not_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let p1 = unique_path(dir.path(), "shot", "png");
        std::fs::write(&p1, b"x").unwrap();
        let p2 = unique_path(dir.path(), "shot", "png");
        assert_ne!(p1, p2);
        assert!(p2.to_string_lossy().ends_with("shot (2).png"));
    }

    #[test]
    fn dated_layout() {
        let when = chrono::TimeZone::with_ymd_and_hms(&Local, 2026, 9, 22, 10, 0, 0).unwrap();
        let p = dated_dir(Path::new("R"), when);
        assert_eq!(p, Path::new("R").join("Screenshots").join("2026").join("09").join("22"));
    }
}
