//! Collections repository.

use r2d2_sqlite::rusqlite::{params, Connection, ErrorCode, OptionalExtension};

use super::models::Collection;
use super::{now_ms, search};
use crate::error::{AppError, AppResult};

pub const ICONS: &[&str] = &[
    "folder", "code", "briefcase", "receipt", "palette", "bug", "book", "star", "heart", "globe", "camera",
    "gamepad", "music", "graduation", "chart", "message", "shopping", "plane", "home", "lightbulb", "shield",
    "terminal", "film", "layers",
];
pub const COLORS: &[&str] = &["blue", "violet", "pink", "red", "orange", "amber", "green", "teal", "cyan", "slate"];

pub fn validate_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Invalid("name_required".into()));
    }
    if name.chars().count() > 60 {
        return Err(AppError::Invalid("name_too_long".into()));
    }
    Ok(name.to_string())
}

fn validate_icon(icon: &str) -> AppResult<()> {
    if ICONS.contains(&icon) { Ok(()) } else { Err(AppError::Invalid(format!("unknown icon {icon}"))) }
}

fn validate_color(color: &str) -> AppResult<()> {
    if COLORS.contains(&color) { Ok(()) } else { Err(AppError::Invalid(format!("unknown color {color}"))) }
}

fn map_unique(e: r2d2_sqlite::rusqlite::Error) -> AppError {
    match &e {
        r2d2_sqlite::rusqlite::Error::SqliteFailure(f, _) if f.code == ErrorCode::ConstraintViolation => {
            AppError::Invalid("name_exists".into())
        }
        _ => e.into(),
    }
}

pub fn list(conn: &Connection) -> AppResult<Vec<Collection>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.name, c.icon, c.color, c.sort_order, c.created_at, c.updated_at,
                count(s.id), COALESCE(sum(s.file_size), 0), max(s.imported_at)
         FROM collections c
         LEFT JOIN screenshots s ON s.collection_id = c.id AND s.trashed_at IS NULL
         GROUP BY c.id
         ORDER BY c.sort_order ASC, c.name COLLATE NOCASE ASC",
    )?;
    let mut items = stmt
        .query_map([], |r| {
            Ok(Collection {
                id: r.get(0)?,
                name: r.get(1)?,
                icon: r.get(2)?,
                color: r.get(3)?,
                sort_order: r.get(4)?,
                created_at: r.get(5)?,
                updated_at: r.get(6)?,
                count: r.get(7)?,
                total_size: r.get(8)?,
                last_added_at: r.get(9)?,
                cover_ids: vec![],
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut cover_stmt = conn.prepare(
        "SELECT id FROM screenshots WHERE collection_id = ?1 AND trashed_at IS NULL ORDER BY captured_at DESC LIMIT 3",
    )?;
    for c in &mut items {
        c.cover_ids = cover_stmt.query_map([c.id], |r| r.get(0))?.collect::<Result<Vec<i64>, _>>()?;
    }
    Ok(items)
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Collection> {
    list(conn)?.into_iter().find(|c| c.id == id).ok_or_else(|| AppError::NotFound(format!("collection {id}")))
}

pub fn create(conn: &Connection, name: &str, icon: &str, color: &str) -> AppResult<Collection> {
    let name = validate_name(name)?;
    validate_icon(icon)?;
    validate_color(color)?;
    let now = now_ms();
    let order: i64 = conn.query_row("SELECT COALESCE(max(sort_order), 0) + 1 FROM collections", [], |r| r.get(0))?;
    conn.execute(
        "INSERT INTO collections (name, icon, color, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![name, icon, color, order, now],
    )
    .map_err(map_unique)?;
    get(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, name: &str, icon: &str, color: &str) -> AppResult<Collection> {
    let name = validate_name(name)?;
    validate_icon(icon)?;
    validate_color(color)?;
    let n = conn
        .execute(
            "UPDATE collections SET name = ?1, icon = ?2, color = ?3, updated_at = ?4 WHERE id = ?5",
            params![name, icon, color, now_ms(), id],
        )
        .map_err(map_unique)?;
    if n == 0 {
        return Err(AppError::NotFound(format!("collection {id}")));
    }
    let members = member_ids(conn, id)?;
    search::reindex_many(conn, &members)?;
    get(conn, id)
}

pub fn member_ids(conn: &Connection, id: i64) -> AppResult<Vec<i64>> {
    let mut stmt = conn.prepare("SELECT id FROM screenshots WHERE collection_id = ?1")?;
    let ids = stmt.query_map([id], |r| r.get(0))?.collect::<Result<Vec<i64>, _>>()?;
    Ok(ids)
}

/// Deletes a collection. Its screenshots are kept and become uncategorized.
pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    let members = member_ids(conn, id)?;
    let n = conn.execute("DELETE FROM collections WHERE id = ?1", [id])?;
    if n == 0 {
        return Err(AppError::NotFound(format!("collection {id}")));
    }
    search::reindex_many(conn, &members)?;
    Ok(())
}

pub fn find_by_name(conn: &Connection, name: &str) -> AppResult<Option<i64>> {
    Ok(conn
        .query_row("SELECT id FROM collections WHERE name = ?1 COLLATE NOCASE", [name.trim()], |r| r.get(0))
        .optional()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::screenshots::{self, tests::sample, ListQuery};
    use crate::db::open_memory;

    #[test]
    fn create_rename_delete() {
        let conn = open_memory().unwrap();
        let c = create(&conn, "  Work ", "briefcase", "blue").unwrap();
        assert_eq!(c.name, "Work");
        let c = update(&conn, c.id, "Office", "code", "green").unwrap();
        assert_eq!((c.name.as_str(), c.icon.as_str(), c.color.as_str()), ("Office", "code", "green"));
        delete(&conn, c.id).unwrap();
        assert!(list(&conn).unwrap().is_empty());
    }

    #[test]
    fn names_are_unique_case_insensitive() {
        let conn = open_memory().unwrap();
        create(&conn, "Receipts", "receipt", "amber").unwrap();
        let err = create(&conn, "receipts", "receipt", "amber").unwrap_err();
        assert!(matches!(err, AppError::Invalid(ref m) if m == "name_exists"));
    }

    #[test]
    fn rejects_invalid_input() {
        let conn = open_memory().unwrap();
        assert!(create(&conn, "   ", "folder", "blue").is_err());
        assert!(create(&conn, "X", "../../etc", "blue").is_err());
        assert!(create(&conn, "X", "folder", "#fff").is_err());
    }

    #[test]
    fn moving_screenshots_updates_counts_and_search() {
        let conn = open_memory().unwrap();
        let c = create(&conn, "Errors", "bug", "red").unwrap();
        let a = screenshots::insert(&conn, &sample("C:/s/a.png", "aa", 1)).unwrap();
        screenshots::set_collection(&conn, &[a], Some(c.id)).unwrap();
        let listed = list(&conn).unwrap();
        assert_eq!(listed[0].count, 1);
        assert_eq!(listed[0].cover_ids, vec![a]);

        let mut q = ListQuery { scope: "all".into(), limit: 10, ..Default::default() };
        q.search = Some("errors".into());
        assert_eq!(screenshots::list(&conn, &q).unwrap().total, 1, "collection name is searchable");

        update(&conn, c.id, "Crashes", "bug", "red").unwrap();
        assert_eq!(screenshots::list(&conn, &q).unwrap().total, 0);
        q.search = Some("crashes".into());
        assert_eq!(screenshots::list(&conn, &q).unwrap().total, 1);
    }

    #[test]
    fn deleting_collection_keeps_screenshots() {
        let conn = open_memory().unwrap();
        let c = create(&conn, "Temp", "folder", "blue").unwrap();
        let a = screenshots::insert(&conn, &sample("C:/s/a.png", "aa", 1)).unwrap();
        screenshots::set_collection(&conn, &[a], Some(c.id)).unwrap();
        delete(&conn, c.id).unwrap();
        let s = screenshots::summary(&conn, a).unwrap();
        assert_eq!(s.collection_id, None);
    }
}
