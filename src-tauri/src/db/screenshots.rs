//! Screenshot repository.

use r2d2_sqlite::rusqlite::types::Value;
use r2d2_sqlite::rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};
use serde::Deserialize;

use super::models::{FileRef, NewScreenshot, OcrInfo, OcrWord, Page, ScreenshotDetail, ScreenshotSummary};
use super::{now_ms, search};
use crate::error::{AppError, AppResult};

/// Screenshots at least this large (bytes) or this many pixels count as "large".
pub const LARGE_BYTES: i64 = 2 * 1024 * 1024;
pub const LARGE_PIXELS: i64 = 2560 * 1440;

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ListQuery {
    /// all | recent | favorites | trash | collection | tag | uncategorized
    pub scope: String,
    pub collection_id: Option<i64>,
    pub tag_id: Option<i64>,
    pub search: Option<String>,
    pub date_from: Option<i64>,
    pub date_to: Option<i64>,
    pub favorites_only: bool,
    /// with | without
    pub ocr: Option<String>,
    pub large_only: bool,
    pub collection_ids: Vec<i64>,
    pub tag_ids: Vec<i64>,
    pub min_width: Option<i64>,
    pub min_height: Option<i64>,
    /// newest | oldest | largest | smallest | name | added | trashed
    pub sort: String,
    pub recent_since: Option<i64>,
    pub offset: i64,
    pub limit: i64,
}

const SUMMARY_COLUMNS: &str = "s.id, s.name, s.format, s.width, s.height, s.file_size, s.captured_at,
    s.imported_at, s.updated_at, s.is_favorite, s.collection_id, s.ocr_status,
    EXISTS(SELECT 1 FROM notes n WHERE n.screenshot_id = s.id AND n.body <> '') AS has_note,
    s.edited_path IS NOT NULL AS has_edit, s.missing, s.trashed_at,
    (SELECT group_concat(st.tag_id) FROM screenshot_tags st WHERE st.screenshot_id = s.id) AS tag_ids,
    s.image_version";

fn summary_from_row(r: &Row) -> r2d2_sqlite::rusqlite::Result<ScreenshotSummary> {
    let tag_ids: Option<String> = r.get(16)?;
    Ok(ScreenshotSummary {
        id: r.get(0)?,
        name: r.get(1)?,
        format: r.get(2)?,
        width: r.get(3)?,
        height: r.get(4)?,
        file_size: r.get(5)?,
        captured_at: r.get(6)?,
        imported_at: r.get(7)?,
        updated_at: r.get(8)?,
        is_favorite: r.get::<_, i64>(9)? != 0,
        collection_id: r.get(10)?,
        ocr_status: r.get(11)?,
        has_note: r.get::<_, i64>(12)? != 0,
        has_edit: r.get::<_, i64>(13)? != 0,
        missing: r.get::<_, i64>(14)? != 0,
        trashed_at: r.get(15)?,
        tag_ids: tag_ids
            .map(|s| s.split(',').filter_map(|t| t.parse().ok()).collect())
            .unwrap_or_default(),
        image_version: r.get(17)?,
    })
}

pub fn placeholders(n: usize) -> String {
    vec!["?"; n].join(",")
}

/// Builds the WHERE clause and bound values for a list query.
fn build_filter(q: &ListQuery) -> (String, Vec<Value>) {
    let mut clauses: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    if q.scope == "trash" {
        clauses.push("s.trashed_at IS NOT NULL".into());
    } else {
        clauses.push("s.trashed_at IS NULL".into());
    }
    match q.scope.as_str() {
        "favorites" => clauses.push("s.is_favorite = 1".into()),
        "recent" => {
            clauses.push("s.imported_at >= ?".into());
            values.push(Value::Integer(q.recent_since.unwrap_or(now_ms() - 7 * 86_400_000)));
        }
        "collection" => {
            clauses.push("s.collection_id = ?".into());
            values.push(Value::Integer(q.collection_id.unwrap_or(-1)));
        }
        "uncategorized" => clauses.push("s.collection_id IS NULL".into()),
        "tag" => {
            clauses.push("EXISTS(SELECT 1 FROM screenshot_tags st WHERE st.screenshot_id = s.id AND st.tag_id = ?)".into());
            values.push(Value::Integer(q.tag_id.unwrap_or(-1)));
        }
        _ => {}
    }

    if let Some(text) = q.search.as_deref().filter(|t| !t.trim().is_empty()) {
        let parsed = search::parse_search(text);
        if let Some(fts) = parsed.fts {
            clauses.push("s.id IN (SELECT rowid FROM search_fts WHERE search_fts MATCH ?)".into());
            values.push(Value::Text(fts));
        }
        for tag in parsed.tag_names {
            clauses.push(
                "EXISTS(SELECT 1 FROM screenshot_tags st JOIN tags t ON t.id = st.tag_id
                 WHERE st.screenshot_id = s.id AND t.name LIKE ? ESCAPE '\\')"
                    .into(),
            );
            let escaped = tag.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
            values.push(Value::Text(format!("{escaped}%")));
        }
        if let Some((a, b)) = parsed.date_range {
            clauses.push("s.captured_at >= ? AND s.captured_at < ?".into());
            values.push(Value::Integer(a));
            values.push(Value::Integer(b));
        }
    }

    if let Some(from) = q.date_from {
        clauses.push("s.captured_at >= ?".into());
        values.push(Value::Integer(from));
    }
    if let Some(to) = q.date_to {
        clauses.push("s.captured_at < ?".into());
        values.push(Value::Integer(to));
    }
    if q.favorites_only {
        clauses.push("s.is_favorite = 1".into());
    }
    match q.ocr.as_deref() {
        Some("with") => clauses.push("s.ocr_status = 'done'".into()),
        Some("without") => clauses.push("s.ocr_status <> 'done'".into()),
        _ => {}
    }
    if q.large_only {
        clauses.push("(s.file_size >= ? OR s.width * s.height >= ?)".into());
        values.push(Value::Integer(LARGE_BYTES));
        values.push(Value::Integer(LARGE_PIXELS));
    }
    if !q.collection_ids.is_empty() {
        clauses.push(format!("s.collection_id IN ({})", placeholders(q.collection_ids.len())));
        values.extend(q.collection_ids.iter().map(|&i| Value::Integer(i)));
    }
    if !q.tag_ids.is_empty() {
        clauses.push(format!(
            "EXISTS(SELECT 1 FROM screenshot_tags st WHERE st.screenshot_id = s.id AND st.tag_id IN ({}))",
            placeholders(q.tag_ids.len())
        ));
        values.extend(q.tag_ids.iter().map(|&i| Value::Integer(i)));
    }
    if let Some(w) = q.min_width {
        clauses.push("s.width >= ?".into());
        values.push(Value::Integer(w));
    }
    if let Some(h) = q.min_height {
        clauses.push("s.height >= ?".into());
        values.push(Value::Integer(h));
    }
    (clauses.join(" AND "), values)
}

fn order_by(q: &ListQuery) -> &'static str {
    match q.sort.as_str() {
        "oldest" => "s.captured_at ASC, s.id ASC",
        "largest" => "s.file_size DESC, s.id DESC",
        "smallest" => "s.file_size ASC, s.id ASC",
        "name" => "s.name COLLATE NOCASE ASC, s.id ASC",
        "added" => "s.imported_at DESC, s.id DESC",
        "trashed" => "s.trashed_at DESC, s.id DESC",
        _ if q.scope == "trash" => "s.trashed_at DESC, s.id DESC",
        _ if q.scope == "recent" => "s.imported_at DESC, s.id DESC",
        _ => "s.captured_at DESC, s.id DESC",
    }
}

pub fn list(conn: &Connection, q: &ListQuery) -> AppResult<Page<ScreenshotSummary>> {
    let (filter, values) = build_filter(q);
    let total: i64 = conn.query_row(
        &format!("SELECT count(*) FROM screenshots s WHERE {filter}"),
        params_from_iter(values.iter()),
        |r| r.get(0),
    )?;
    let limit = q.limit.clamp(1, 1000);
    let offset = q.offset.max(0);
    let sql = format!(
        "SELECT {SUMMARY_COLUMNS} FROM screenshots s WHERE {filter} ORDER BY {} LIMIT {limit} OFFSET {offset}",
        order_by(q)
    );
    let mut stmt = conn.prepare(&sql)?;
    let items = stmt
        .query_map(params_from_iter(values.iter()), summary_from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Page { items, total, offset })
}

/// All ids matching a query (for "select all" and bulk operations).
pub fn list_ids(conn: &Connection, q: &ListQuery) -> AppResult<Vec<i64>> {
    let (filter, values) = build_filter(q);
    let sql = format!("SELECT s.id FROM screenshots s WHERE {filter} ORDER BY {}", order_by(q));
    let mut stmt = conn.prepare(&sql)?;
    let ids = stmt.query_map(params_from_iter(values.iter()), |r| r.get(0))?.collect::<Result<Vec<i64>, _>>()?;
    Ok(ids)
}

pub fn summaries_by_ids(conn: &Connection, ids: &[i64]) -> AppResult<Vec<ScreenshotSummary>> {
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let sql = format!("SELECT {SUMMARY_COLUMNS} FROM screenshots s WHERE s.id IN ({})", placeholders(ids.len()));
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query_map(params_from_iter(ids.iter()), summary_from_row)?.collect::<Result<Vec<_>, _>>()?;
    // Preserve the caller's order.
    rows.sort_by_key(|s| ids.iter().position(|&i| i == s.id).unwrap_or(usize::MAX));
    Ok(rows)
}

pub fn summary(conn: &Connection, id: i64) -> AppResult<ScreenshotSummary> {
    conn.query_row(&format!("SELECT {SUMMARY_COLUMNS} FROM screenshots s WHERE s.id = ?1"), [id], summary_from_row)
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("screenshot {id}")))
}

pub fn detail(conn: &Connection, id: i64) -> AppResult<ScreenshotDetail> {
    let summary = summary(conn, id)?;
    let (file_path, edited_path, sha256, source, capture_mode, source_monitor, fc, fm): (
        String,
        Option<String>,
        String,
        String,
        Option<String>,
        Option<String>,
        Option<i64>,
        Option<i64>,
    ) = conn.query_row(
        "SELECT file_path, edited_path, sha256, source, capture_mode, source_monitor, file_created_at, file_modified_at
         FROM screenshots WHERE id = ?1",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?)),
    )?;
    let note: String = conn
        .query_row("SELECT body FROM notes WHERE screenshot_id = ?1", [id], |r| r.get(0))
        .optional()?
        .unwrap_or_default();
    let ocr = get_ocr(conn, id)?;
    let current = edited_path.as_deref().unwrap_or(&file_path);
    let file_exists = std::path::Path::new(current).is_file();
    Ok(ScreenshotDetail {
        summary,
        file_path,
        edited_path,
        file_exists,
        sha256,
        source,
        capture_mode,
        source_monitor,
        file_created_at: fc,
        file_modified_at: fm,
        note,
        ocr,
    })
}

pub fn get_ocr(conn: &Connection, id: i64) -> AppResult<Option<OcrInfo>> {
    let row: Option<(String, Option<String>, String, String, i64, i64)> = conn
        .query_row(
            "SELECT text, words_json, language, engine, edited, updated_at FROM ocr_data WHERE screenshot_id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
        )
        .optional()?;
    Ok(row.map(|(text, words_json, language, engine, edited, updated_at)| OcrInfo {
        text,
        words: words_json
            .and_then(|j| serde_json::from_str::<Vec<OcrWord>>(&j).ok())
            .unwrap_or_default(),
        language,
        engine,
        edited: edited != 0,
        updated_at,
    }))
}

pub fn insert(conn: &Connection, s: &NewScreenshot) -> AppResult<i64> {
    let now = now_ms();
    conn.execute(
        "INSERT INTO screenshots (file_path, name, format, width, height, file_size, sha256, phash, source,
            capture_mode, source_monitor, owned, collection_id, captured_at, file_created_at, file_modified_at,
            imported_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?17)",
        params![
            s.file_path,
            s.name,
            s.format,
            s.width,
            s.height,
            s.file_size,
            s.sha256,
            s.phash,
            s.source,
            s.capture_mode,
            s.source_monitor,
            s.owned as i64,
            s.collection_id,
            s.captured_at,
            s.file_created_at,
            s.file_modified_at,
            now,
        ],
    )?;
    let id = conn.last_insert_rowid();
    search::reindex(conn, id)?;
    Ok(id)
}

pub fn find_by_sha(conn: &Connection, sha: &str) -> AppResult<Option<i64>> {
    Ok(conn
        .query_row("SELECT id FROM screenshots WHERE sha256 = ?1 ORDER BY id LIMIT 1", [sha], |r| r.get(0))
        .optional()?)
}

pub fn find_by_path(conn: &Connection, path: &str) -> AppResult<Option<i64>> {
    Ok(conn
        .query_row("SELECT id FROM screenshots WHERE file_path = ?1 COLLATE NOCASE LIMIT 1", [path], |r| r.get(0))
        .optional()?)
}

pub fn file_ref(conn: &Connection, id: i64) -> AppResult<FileRef> {
    conn.query_row(
        "SELECT id, file_path, edited_path, owned, name, format FROM screenshots WHERE id = ?1",
        [id],
        |r| {
            Ok(FileRef {
                id: r.get(0)?,
                file_path: r.get(1)?,
                edited_path: r.get(2)?,
                owned: r.get::<_, i64>(3)? != 0,
                name: r.get(4)?,
                format: r.get(5)?,
            })
        },
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("screenshot {id}")))
}

fn touch_many(conn: &Connection, sql_set: &str, ids: &[i64], extra: Vec<Value>) -> AppResult<usize> {
    if ids.is_empty() {
        return Ok(0);
    }
    let mut changed = 0;
    for chunk in ids.chunks(500) {
        let sql = format!("UPDATE screenshots SET {sql_set} WHERE id IN ({})", placeholders(chunk.len()));
        let mut values = extra.clone();
        values.extend(chunk.iter().map(|&i| Value::Integer(i)));
        changed += conn.execute(&sql, params_from_iter(values.iter()))?;
    }
    Ok(changed)
}

pub fn set_favorite(conn: &Connection, ids: &[i64], favorite: bool) -> AppResult<usize> {
    let now = now_ms();
    touch_many(
        conn,
        "is_favorite = ?, favorited_at = ?, updated_at = ?",
        ids,
        vec![
            Value::Integer(favorite as i64),
            if favorite { Value::Integer(now) } else { Value::Null },
            Value::Integer(now),
        ],
    )
}

pub fn set_collection(conn: &Connection, ids: &[i64], collection_id: Option<i64>) -> AppResult<usize> {
    let n = touch_many(
        conn,
        "collection_id = ?, updated_at = ?",
        ids,
        vec![collection_id.map(Value::Integer).unwrap_or(Value::Null), Value::Integer(now_ms())],
    )?;
    search::reindex_many(conn, ids)?;
    Ok(n)
}

pub fn trash(conn: &Connection, ids: &[i64]) -> AppResult<usize> {
    let now = now_ms();
    let mut n = 0;
    for chunk in ids.chunks(500) {
        let sql = format!(
            "UPDATE screenshots SET trashed_at = ?, updated_at = ? WHERE trashed_at IS NULL AND id IN ({})",
            placeholders(chunk.len())
        );
        let mut values = vec![Value::Integer(now), Value::Integer(now)];
        values.extend(chunk.iter().map(|&i| Value::Integer(i)));
        n += conn.execute(&sql, params_from_iter(values.iter()))?;
    }
    Ok(n)
}

pub fn restore(conn: &Connection, ids: &[i64]) -> AppResult<usize> {
    touch_many(conn, "trashed_at = NULL, updated_at = ?", ids, vec![Value::Integer(now_ms())])
}

/// Removes database rows (tags, OCR and notes cascade). Files are handled by the caller.
pub fn delete_rows(conn: &Connection, ids: &[i64]) -> AppResult<usize> {
    let mut n = 0;
    for &id in ids {
        search::remove(conn, id)?;
        n += conn.execute("DELETE FROM screenshots WHERE id = ?1", [id])?;
    }
    Ok(n)
}

pub fn trashed_before(conn: &Connection, cutoff: i64) -> AppResult<Vec<i64>> {
    let mut stmt = conn.prepare("SELECT id FROM screenshots WHERE trashed_at IS NOT NULL AND trashed_at < ?1")?;
    let ids = stmt.query_map([cutoff], |r| r.get(0))?.collect::<Result<Vec<i64>, _>>()?;
    Ok(ids)
}

pub fn all_trashed(conn: &Connection) -> AppResult<Vec<i64>> {
    trashed_before(conn, i64::MAX)
}

pub fn rename(conn: &Connection, id: i64, name: &str, new_path: Option<&str>) -> AppResult<()> {
    let now = now_ms();
    match new_path {
        Some(p) => conn.execute(
            "UPDATE screenshots SET name = ?1, file_path = ?2, updated_at = ?3 WHERE id = ?4",
            params![name, p, now, id],
        )?,
        None => conn.execute("UPDATE screenshots SET name = ?1, updated_at = ?2 WHERE id = ?3", params![name, now, id])?,
    };
    search::reindex(conn, id)?;
    Ok(())
}

pub fn set_note(conn: &Connection, id: i64, body: &str) -> AppResult<()> {
    let now = now_ms();
    if body.trim().is_empty() {
        conn.execute("DELETE FROM notes WHERE screenshot_id = ?1", [id])?;
    } else {
        conn.execute(
            "INSERT INTO notes (screenshot_id, body, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(screenshot_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at",
            params![id, body, now],
        )?;
    }
    conn.execute("UPDATE screenshots SET updated_at = ?1 WHERE id = ?2", params![now, id])?;
    search::reindex(conn, id)?;
    Ok(())
}

pub fn set_ocr_status(conn: &Connection, id: i64, status: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE screenshots SET ocr_status = ?1, updated_at = ?2 WHERE id = ?3",
        params![status, now_ms(), id],
    )?;
    Ok(())
}

pub fn save_ocr(
    conn: &Connection,
    id: i64,
    text: &str,
    words: Option<&[OcrWord]>,
    language: &str,
    engine: &str,
    edited: bool,
) -> AppResult<()> {
    let now = now_ms();
    let words_json = words.map(|w| serde_json::to_string(w).unwrap_or_default());
    conn.execute(
        "INSERT INTO ocr_data (screenshot_id, text, words_json, language, engine, edited, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT(screenshot_id) DO UPDATE SET text = excluded.text,
            words_json = COALESCE(excluded.words_json, ocr_data.words_json),
            language = excluded.language, engine = excluded.engine, edited = excluded.edited,
            updated_at = excluded.updated_at",
        params![id, text, words_json, language, engine, edited as i64, now],
    )?;
    let status = if text.trim().is_empty() { "empty" } else { "done" };
    set_ocr_status(conn, id, status)?;
    search::reindex(conn, id)?;
    Ok(())
}

pub fn set_edited(conn: &Connection, id: i64, edited_path: Option<&str>, width: i64, height: i64, size: i64) -> AppResult<()> {
    conn.execute(
        "UPDATE screenshots SET edited_path = ?1, width = ?2, height = ?3, file_size = ?4, updated_at = ?5,
            image_version = image_version + 1 WHERE id = ?6",
        params![edited_path, width, height, size, now_ms(), id],
    )?;
    Ok(())
}

pub fn set_missing(conn: &Connection, id: i64, missing: bool) -> AppResult<()> {
    conn.execute("UPDATE screenshots SET missing = ?1 WHERE id = ?2", params![missing as i64, id])?;
    Ok(())
}

pub fn ids_needing_ocr(conn: &Connection) -> AppResult<Vec<i64>> {
    let mut stmt =
        conn.prepare("SELECT id FROM screenshots WHERE trashed_at IS NULL AND ocr_status IN ('none','failed','pending') ORDER BY captured_at DESC")?;
    let ids = stmt.query_map([], |r| r.get(0))?.collect::<Result<Vec<i64>, _>>()?;
    Ok(ids)
}

pub fn all_active_ids(conn: &Connection) -> AppResult<Vec<i64>> {
    let mut stmt = conn.prepare("SELECT id FROM screenshots WHERE trashed_at IS NULL ORDER BY captured_at DESC")?;
    let ids = stmt.query_map([], |r| r.get(0))?.collect::<Result<Vec<i64>, _>>()?;
    Ok(ids)
}

pub fn all_paths(conn: &Connection) -> AppResult<std::collections::HashSet<String>> {
    let mut stmt = conn.prepare("SELECT lower(file_path) FROM screenshots")?;
    let set = stmt.query_map([], |r| r.get::<_, String>(0))?.collect::<Result<_, _>>()?;
    Ok(set)
}

/// Screenshot with OCR text, used by the OCR search page.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrHit {
    #[serde(flatten)]
    pub summary: ScreenshotSummary,
    pub ocr_text: String,
}

pub fn ocr_hits(conn: &Connection, q: &ListQuery) -> AppResult<Page<OcrHit>> {
    let page = list(conn, q)?;
    let mut items = Vec::with_capacity(page.items.len());
    for s in page.items {
        let text: String = conn
            .query_row("SELECT text FROM ocr_data WHERE screenshot_id = ?1", [s.id], |r| r.get(0))
            .optional()?
            .unwrap_or_default();
        items.push(OcrHit { summary: s, ocr_text: text });
    }
    Ok(Page { items, total: page.total, offset: page.offset })
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::db::open_memory;

    pub fn sample(path: &str, sha: &str, captured_at: i64) -> NewScreenshot {
        NewScreenshot {
            file_path: path.into(),
            name: std::path::Path::new(path).file_stem().unwrap().to_string_lossy().into_owned(),
            format: "png".into(),
            width: 1920,
            height: 1080,
            file_size: 250_000,
            sha256: sha.into(),
            phash: Some(vec![0; 32]),
            source: "capture".into(),
            capture_mode: Some("region".into()),
            source_monitor: Some("Display 1".into()),
            owned: true,
            captured_at,
            file_created_at: None,
            file_modified_at: None,
            collection_id: None,
        }
    }

    fn q(scope: &str) -> ListQuery {
        ListQuery { scope: scope.into(), limit: 100, ..Default::default() }
    }

    #[test]
    fn insert_and_list_newest_first() {
        let conn = open_memory().unwrap();
        let a = insert(&conn, &sample("C:/s/a.png", "aa", 1000)).unwrap();
        let b = insert(&conn, &sample("C:/s/b.png", "bb", 2000)).unwrap();
        let page = list(&conn, &q("all")).unwrap();
        assert_eq!(page.total, 2);
        assert_eq!(page.items.iter().map(|s| s.id).collect::<Vec<_>>(), vec![b, a]);
    }

    #[test]
    fn duplicate_path_is_rejected() {
        let conn = open_memory().unwrap();
        insert(&conn, &sample("C:/s/a.png", "aa", 1000)).unwrap();
        assert!(insert(&conn, &sample("C:/s/a.png", "zz", 1000)).is_err());
    }

    #[test]
    fn trash_and_restore_move_between_scopes() {
        let conn = open_memory().unwrap();
        let a = insert(&conn, &sample("C:/s/a.png", "aa", 1000)).unwrap();
        insert(&conn, &sample("C:/s/b.png", "bb", 2000)).unwrap();
        assert_eq!(trash(&conn, &[a]).unwrap(), 1);
        assert_eq!(list(&conn, &q("all")).unwrap().total, 1);
        let t = list(&conn, &q("trash")).unwrap();
        assert_eq!(t.total, 1);
        assert!(t.items[0].trashed_at.is_some());
        restore(&conn, &[a]).unwrap();
        assert_eq!(list(&conn, &q("all")).unwrap().total, 2);
        assert_eq!(list(&conn, &q("trash")).unwrap().total, 0);
    }

    #[test]
    fn delete_rows_cascades() {
        let conn = open_memory().unwrap();
        let a = insert(&conn, &sample("C:/s/a.png", "aa", 1000)).unwrap();
        set_note(&conn, a, "hello").unwrap();
        save_ocr(&conn, a, "some text", None, "en", "test", false).unwrap();
        delete_rows(&conn, &[a]).unwrap();
        let notes: i64 = conn.query_row("SELECT count(*) FROM notes", [], |r| r.get(0)).unwrap();
        let ocr: i64 = conn.query_row("SELECT count(*) FROM ocr_data", [], |r| r.get(0)).unwrap();
        let fts: i64 = conn.query_row("SELECT count(*) FROM search_fts", [], |r| r.get(0)).unwrap();
        assert_eq!((notes, ocr, fts), (0, 0, 0));
    }

    #[test]
    fn ocr_text_is_searchable() {
        let conn = open_memory().unwrap();
        let a = insert(&conn, &sample("C:/s/a.png", "aa", 1000)).unwrap();
        let b = insert(&conn, &sample("C:/s/b.png", "bb", 2000)).unwrap();
        save_ocr(&conn, a, "Deploying to Cloudflare R2 bucket", None, "en", "test", false).unwrap();
        save_ocr(&conn, b, "Vercel deployment logs", None, "en", "test", false).unwrap();
        let mut query = q("all");
        query.search = Some("Cloudflare".into());
        let page = list(&conn, &query).unwrap();
        assert_eq!(page.items.iter().map(|s| s.id).collect::<Vec<_>>(), vec![a]);
        query.search = Some("cloud".into());
        assert_eq!(list(&conn, &query).unwrap().total, 1, "prefix match");
        query.search = Some("deploy".into());
        assert_eq!(list(&conn, &query).unwrap().total, 2);
    }

    #[test]
    fn arabic_ocr_search_ignores_letter_variants() {
        let conn = open_memory().unwrap();
        let a = insert(&conn, &sample("C:/s/a.png", "aa", 1000)).unwrap();
        save_ocr(&conn, a, "فاتورة الإنترنت الشهرية", None, "ar", "test", false).unwrap();
        let mut query = q("all");
        query.search = Some("فاتوره الانترنت".into());
        assert_eq!(list(&conn, &query).unwrap().total, 1);
    }

    #[test]
    fn notes_are_searchable_and_cleared() {
        let conn = open_memory().unwrap();
        let a = insert(&conn, &sample("C:/s/a.png", "aa", 1000)).unwrap();
        set_note(&conn, a, "This error happened after upgrading Next.js").unwrap();
        let mut query = q("all");
        query.search = Some("upgrading".into());
        assert_eq!(list(&conn, &query).unwrap().total, 1);
        assert!(summary(&conn, a).unwrap().has_note);
        set_note(&conn, a, "  ").unwrap();
        assert_eq!(list(&conn, &query).unwrap().total, 0);
        assert!(!summary(&conn, a).unwrap().has_note);
    }

    #[test]
    fn filters_combine() {
        let conn = open_memory().unwrap();
        let a = insert(&conn, &sample("C:/s/a.png", "aa", 1000)).unwrap();
        let mut big = sample("C:/s/b.png", "bb", 5000);
        big.file_size = LARGE_BYTES + 1;
        let b = insert(&conn, &big).unwrap();
        set_favorite(&conn, &[a], true).unwrap();

        let mut query = q("all");
        query.favorites_only = true;
        assert_eq!(list(&conn, &query).unwrap().items[0].id, a);

        let mut query = q("all");
        query.large_only = true;
        assert_eq!(list(&conn, &query).unwrap().items[0].id, b);

        let mut query = q("all");
        query.date_from = Some(2000);
        query.date_to = Some(6000);
        assert_eq!(list(&conn, &query).unwrap().items[0].id, b);

        let mut query = q("all");
        query.ocr = Some("without".into());
        assert_eq!(list(&conn, &query).unwrap().total, 2);
        query.ocr = Some("with".into());
        assert_eq!(list(&conn, &query).unwrap().total, 0);

        let mut query = q("favorites");
        query.sort = "largest".into();
        assert_eq!(list(&conn, &query).unwrap().total, 1);
    }

    #[test]
    fn pagination_is_stable() {
        let conn = open_memory().unwrap();
        for i in 0..25 {
            insert(&conn, &sample(&format!("C:/s/{i}.png"), &format!("h{i}"), 1000 + i)).unwrap();
        }
        let mut query = q("all");
        query.limit = 10;
        let p1 = list(&conn, &query).unwrap();
        query.offset = 10;
        let p2 = list(&conn, &query).unwrap();
        query.offset = 20;
        let p3 = list(&conn, &query).unwrap();
        assert_eq!(p1.total, 25);
        assert_eq!((p1.items.len(), p2.items.len(), p3.items.len()), (10, 10, 5));
        let mut all: Vec<i64> = p1.items.iter().chain(&p2.items).chain(&p3.items).map(|s| s.id).collect();
        all.dedup();
        assert_eq!(all.len(), 25);
    }
}
