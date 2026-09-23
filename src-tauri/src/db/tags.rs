//! Tags repository.

use r2d2_sqlite::rusqlite::{params, Connection, ErrorCode, OptionalExtension};

use super::models::Tag;
use super::{now_ms, search};
use crate::error::{AppError, AppResult};

pub const COLORS: &[&str] = &["blue", "violet", "pink", "red", "orange", "amber", "green", "teal", "cyan", "slate"];

/// Tags are stored without a leading `#` and cannot contain whitespace.
pub fn validate_name(name: &str) -> AppResult<String> {
    let name = name.trim().trim_start_matches('#').trim();
    if name.is_empty() {
        return Err(AppError::Invalid("name_required".into()));
    }
    if name.chars().count() > 40 {
        return Err(AppError::Invalid("name_too_long".into()));
    }
    if name.chars().any(|c| c.is_whitespace() || c == ',' || c == '#') {
        return Err(AppError::Invalid("tag_invalid_chars".into()));
    }
    Ok(name.to_string())
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

pub fn list(conn: &Connection) -> AppResult<Vec<Tag>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color, t.created_at,
                (SELECT count(*) FROM screenshot_tags st JOIN screenshots s ON s.id = st.screenshot_id
                  WHERE st.tag_id = t.id AND s.trashed_at IS NULL)
         FROM tags t ORDER BY t.name COLLATE NOCASE",
    )?;
    let items = stmt
        .query_map([], |r| {
            Ok(Tag { id: r.get(0)?, name: r.get(1)?, color: r.get(2)?, created_at: r.get(3)?, count: r.get(4)? })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(items)
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Tag> {
    list(conn)?.into_iter().find(|t| t.id == id).ok_or_else(|| AppError::NotFound(format!("tag {id}")))
}

pub fn create(conn: &Connection, name: &str, color: &str) -> AppResult<Tag> {
    let name = validate_name(name)?;
    validate_color(color)?;
    conn.execute("INSERT INTO tags (name, color, created_at) VALUES (?1, ?2, ?3)", params![name, color, now_ms()])
        .map_err(map_unique)?;
    get(conn, conn.last_insert_rowid())
}

/// Returns the existing tag with this name or creates it.
pub fn ensure(conn: &Connection, name: &str, color: &str) -> AppResult<Tag> {
    let clean = validate_name(name)?;
    let existing: Option<i64> = conn
        .query_row("SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE", [&clean], |r| r.get(0))
        .optional()?;
    match existing {
        Some(id) => get(conn, id),
        None => create(conn, &clean, color),
    }
}

pub fn update(conn: &Connection, id: i64, name: &str, color: &str) -> AppResult<Tag> {
    let name = validate_name(name)?;
    validate_color(color)?;
    let n = conn
        .execute("UPDATE tags SET name = ?1, color = ?2 WHERE id = ?3", params![name, color, id])
        .map_err(map_unique)?;
    if n == 0 {
        return Err(AppError::NotFound(format!("tag {id}")));
    }
    let members = member_ids(conn, id)?;
    search::reindex_many(conn, &members)?;
    get(conn, id)
}

pub fn member_ids(conn: &Connection, tag_id: i64) -> AppResult<Vec<i64>> {
    let mut stmt = conn.prepare("SELECT screenshot_id FROM screenshot_tags WHERE tag_id = ?1")?;
    let ids = stmt.query_map([tag_id], |r| r.get(0))?.collect::<Result<Vec<i64>, _>>()?;
    Ok(ids)
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    let members = member_ids(conn, id)?;
    let n = conn.execute("DELETE FROM tags WHERE id = ?1", [id])?;
    if n == 0 {
        return Err(AppError::NotFound(format!("tag {id}")));
    }
    search::reindex_many(conn, &members)?;
    Ok(())
}

pub fn add_to(conn: &Connection, screenshot_ids: &[i64], tag_id: i64) -> AppResult<usize> {
    let now = now_ms();
    let mut n = 0;
    for &sid in screenshot_ids {
        n += conn.execute(
            "INSERT OR IGNORE INTO screenshot_tags (screenshot_id, tag_id, created_at) VALUES (?1, ?2, ?3)",
            params![sid, tag_id, now],
        )?;
        conn.execute("UPDATE screenshots SET updated_at = ?1 WHERE id = ?2", params![now, sid])?;
    }
    search::reindex_many(conn, screenshot_ids)?;
    Ok(n)
}

pub fn remove_from(conn: &Connection, screenshot_ids: &[i64], tag_id: i64) -> AppResult<usize> {
    let now = now_ms();
    let mut n = 0;
    for &sid in screenshot_ids {
        n += conn.execute(
            "DELETE FROM screenshot_tags WHERE screenshot_id = ?1 AND tag_id = ?2",
            params![sid, tag_id],
        )?;
        conn.execute("UPDATE screenshots SET updated_at = ?1 WHERE id = ?2", params![now, sid])?;
    }
    search::reindex_many(conn, screenshot_ids)?;
    Ok(n)
}

pub fn most_used(conn: &Connection, limit: i64) -> AppResult<Vec<Tag>> {
    let mut all = list(conn)?;
    all.retain(|t| t.count > 0);
    all.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));
    all.truncate(limit.max(0) as usize);
    Ok(all)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_memory;
    use crate::db::screenshots::{self, tests::sample, ListQuery};

    #[test]
    fn validates_names() {
        assert_eq!(validate_name(" #bug ").unwrap(), "bug");
        assert!(validate_name("two words").is_err());
        assert!(validate_name("#").is_err());
        assert!(validate_name(&"x".repeat(41)).is_err());
        assert_eq!(validate_name("فاتورة").unwrap(), "فاتورة");
    }

    #[test]
    fn tagging_and_filtering() {
        let conn = open_memory().unwrap();
        let bug = create(&conn, "bug", "red").unwrap();
        let design = create(&conn, "design", "violet").unwrap();
        let a = screenshots::insert(&conn, &sample("C:/s/a.png", "aa", 1)).unwrap();
        let b = screenshots::insert(&conn, &sample("C:/s/b.png", "bb", 2)).unwrap();
        add_to(&conn, &[a, b], bug.id).unwrap();
        add_to(&conn, &[b], design.id).unwrap();
        // Adding twice is a no-op.
        assert_eq!(add_to(&conn, &[a], bug.id).unwrap(), 0);

        let q = ListQuery { scope: "tag".into(), tag_id: Some(design.id), limit: 10, ..Default::default() };
        assert_eq!(screenshots::list(&conn, &q).unwrap().items[0].id, b);

        let mut q = ListQuery { scope: "all".into(), limit: 10, ..Default::default() };
        q.search = Some("#des".into());
        assert_eq!(screenshots::list(&conn, &q).unwrap().total, 1);
        q.search = Some("bug".into());
        assert_eq!(screenshots::list(&conn, &q).unwrap().total, 2, "tag names are full-text indexed");

        let s = screenshots::summary(&conn, b).unwrap();
        assert_eq!(s.tag_ids.len(), 2);

        remove_from(&conn, &[a, b], bug.id).unwrap();
        assert_eq!(get(&conn, bug.id).unwrap().count, 0);
        assert_eq!(most_used(&conn, 5).unwrap().iter().map(|t| t.name.as_str()).collect::<Vec<_>>(), vec!["design"]);
    }

    #[test]
    fn deleting_tag_detaches_it() {
        let conn = open_memory().unwrap();
        let t = create(&conn, "tmp", "blue").unwrap();
        let a = screenshots::insert(&conn, &sample("C:/s/a.png", "aa", 1)).unwrap();
        add_to(&conn, &[a], t.id).unwrap();
        delete(&conn, t.id).unwrap();
        assert!(screenshots::summary(&conn, a).unwrap().tag_ids.is_empty());
    }

    #[test]
    fn ensure_reuses_existing() {
        let conn = open_memory().unwrap();
        let t1 = ensure(&conn, "Work", "blue").unwrap();
        let t2 = ensure(&conn, "#work", "red").unwrap();
        assert_eq!(t1.id, t2.id);
        assert!(create(&conn, "WORK", "blue").is_err());
    }
}
