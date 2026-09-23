//! Watched folders repository.

use r2d2_sqlite::rusqlite::{params, Connection, OptionalExtension};

use super::models::WatchedFolder;
use super::now_ms;
use crate::error::{AppError, AppResult};

pub fn list(conn: &Connection) -> AppResult<Vec<WatchedFolder>> {
    let mut stmt = conn.prepare("SELECT id, path, enabled, created_at FROM watched_folders ORDER BY id")?;
    let items = stmt
        .query_map([], |r| {
            let path: String = r.get(1)?;
            Ok(WatchedFolder {
                id: r.get(0)?,
                available: std::path::Path::new(&path).is_dir(),
                path,
                enabled: r.get::<_, i64>(2)? != 0,
                created_at: r.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(items)
}

pub fn add(conn: &Connection, path: &str) -> AppResult<WatchedFolder> {
    let exists: Option<i64> = conn
        .query_row("SELECT id FROM watched_folders WHERE path = ?1 COLLATE NOCASE", [path], |r| r.get(0))
        .optional()?;
    if exists.is_some() {
        return Err(AppError::Invalid("folder_already_watched".into()));
    }
    conn.execute(
        "INSERT INTO watched_folders (path, enabled, created_at) VALUES (?1, 1, ?2)",
        params![path, now_ms()],
    )?;
    let id = conn.last_insert_rowid();
    list(conn)?.into_iter().find(|f| f.id == id).ok_or_else(|| AppError::NotFound("watched folder".into()))
}

pub fn set_enabled(conn: &Connection, id: i64, enabled: bool) -> AppResult<()> {
    conn.execute("UPDATE watched_folders SET enabled = ?1 WHERE id = ?2", params![enabled as i64, id])?;
    Ok(())
}

pub fn remove(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM watched_folders WHERE id = ?1", [id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_memory;

    #[test]
    fn add_toggle_remove() {
        let conn = open_memory().unwrap();
        let f = add(&conn, "C:/Users/me/Pictures/Screenshots").unwrap();
        assert!(f.enabled);
        assert!(add(&conn, "c:/users/me/pictures/screenshots").is_err());
        set_enabled(&conn, f.id, false).unwrap();
        assert!(!list(&conn).unwrap()[0].enabled);
        remove(&conn, f.id).unwrap();
        assert!(list(&conn).unwrap().is_empty());
    }
}
