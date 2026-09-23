//! Aggregate queries for the dashboard, storage page and duplicate finder.

use std::collections::{HashMap, HashSet};

use r2d2_sqlite::rusqlite::{params, Connection};
use serde::Serialize;

use super::models::{Collection, ScreenshotSummary, Tag};
use super::{collections, now_ms, screenshots, tags};
use crate::error::AppResult;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub total: i64,
    pub today: i64,
    pub week: i64,
    pub favorites: i64,
    pub storage_bytes: i64,
    pub ocr_indexed: i64,
    pub ocr_pending: i64,
    pub trash_count: i64,
    pub collections_count: i64,
    pub recent: Vec<ScreenshotSummary>,
    pub top_tags: Vec<Tag>,
    pub recent_collections: Vec<Collection>,
}

fn count(conn: &Connection, sql: &str, p: &[i64]) -> AppResult<i64> {
    let v = conn.query_row(sql, r2d2_sqlite::rusqlite::params_from_iter(p.iter()), |r| r.get(0))?;
    Ok(v)
}

pub fn dashboard(conn: &Connection, today_start: i64, week_start: i64) -> AppResult<DashboardStats> {
    let active = "FROM screenshots WHERE trashed_at IS NULL";
    let total = count(conn, &format!("SELECT count(*) {active}"), &[])?;
    let today = count(conn, &format!("SELECT count(*) {active} AND captured_at >= ?"), &[today_start])?;
    let week = count(conn, &format!("SELECT count(*) {active} AND captured_at >= ?"), &[week_start])?;
    let favorites = count(conn, &format!("SELECT count(*) {active} AND is_favorite = 1"), &[])?;
    let storage_bytes = count(conn, "SELECT COALESCE(sum(file_size), 0) FROM screenshots", &[])?;
    let ocr_indexed = count(conn, &format!("SELECT count(*) {active} AND ocr_status IN ('done','empty')"), &[])?;
    let ocr_pending = count(conn, &format!("SELECT count(*) {active} AND ocr_status IN ('none','pending','failed')"), &[])?;
    let trash_count = count(conn, "SELECT count(*) FROM screenshots WHERE trashed_at IS NOT NULL", &[])?;

    let recent_ids: Vec<i64> = {
        let mut stmt = conn.prepare(&format!("SELECT id {active} ORDER BY imported_at DESC, id DESC LIMIT 12"))?;
        let ids = stmt.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
        ids
    };
    let recent = screenshots::summaries_by_ids(conn, &recent_ids)?;
    let top_tags = tags::most_used(conn, 10)?;
    let all_collections = collections::list(conn)?;
    let collections_count = all_collections.len() as i64;
    let mut recent_collections = all_collections;
    recent_collections.sort_by(|a, b| {
        b.last_added_at.unwrap_or(b.updated_at).cmp(&a.last_added_at.unwrap_or(a.updated_at))
    });
    recent_collections.truncate(4);

    Ok(DashboardStats {
        total,
        today,
        week,
        favorites,
        storage_bytes,
        ocr_indexed,
        ocr_pending,
        trash_count,
        collections_count,
        recent,
        top_tags,
        recent_collections,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bucket {
    pub key: String,
    pub collection_id: Option<i64>,
    pub bytes: i64,
    pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStats {
    pub total_bytes: i64,
    pub count: i64,
    pub trash_bytes: i64,
    pub trash_count: i64,
    pub edited_count: i64,
    pub largest: Vec<ScreenshotSummary>,
    pub oldest: Vec<ScreenshotSummary>,
    pub per_collection: Vec<Bucket>,
    pub per_month: Vec<Bucket>,
}

fn ids(conn: &Connection, sql: &str) -> AppResult<Vec<i64>> {
    let mut stmt = conn.prepare(sql)?;
    let v = stmt.query_map([], |r| r.get(0))?.collect::<Result<Vec<i64>, _>>()?;
    Ok(v)
}

pub fn storage(conn: &Connection) -> AppResult<StorageStats> {
    let total_bytes = count(conn, "SELECT COALESCE(sum(file_size), 0) FROM screenshots WHERE trashed_at IS NULL", &[])?;
    let count_active = count(conn, "SELECT count(*) FROM screenshots WHERE trashed_at IS NULL", &[])?;
    let trash_bytes = count(conn, "SELECT COALESCE(sum(file_size), 0) FROM screenshots WHERE trashed_at IS NOT NULL", &[])?;
    let trash_count = count(conn, "SELECT count(*) FROM screenshots WHERE trashed_at IS NOT NULL", &[])?;
    let edited_count = count(conn, "SELECT count(*) FROM screenshots WHERE edited_path IS NOT NULL", &[])?;
    let largest = screenshots::summaries_by_ids(
        conn,
        &ids(conn, "SELECT id FROM screenshots WHERE trashed_at IS NULL ORDER BY file_size DESC LIMIT 10")?,
    )?;
    let oldest = screenshots::summaries_by_ids(
        conn,
        &ids(conn, "SELECT id FROM screenshots WHERE trashed_at IS NULL ORDER BY captured_at ASC LIMIT 10")?,
    )?;

    let mut stmt = conn.prepare(
        "SELECT c.name, s.collection_id, sum(s.file_size), count(*) FROM screenshots s
         LEFT JOIN collections c ON c.id = s.collection_id
         WHERE s.trashed_at IS NULL GROUP BY s.collection_id ORDER BY sum(s.file_size) DESC",
    )?;
    let per_collection = stmt
        .query_map([], |r| {
            Ok(Bucket {
                key: r.get::<_, Option<String>>(0)?.unwrap_or_default(),
                collection_id: r.get(1)?,
                bytes: r.get(2)?,
                count: r.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut stmt = conn.prepare(
        "SELECT strftime('%Y-%m', captured_at / 1000, 'unixepoch', 'localtime') AS m, sum(file_size), count(*)
         FROM screenshots WHERE trashed_at IS NULL GROUP BY m ORDER BY m DESC LIMIT 12",
    )?;
    let mut per_month = stmt
        .query_map([], |r| Ok(Bucket { key: r.get(0)?, collection_id: None, bytes: r.get(1)?, count: r.get(2)? }))?
        .collect::<Result<Vec<_>, _>>()?;
    per_month.reverse();

    Ok(StorageStats {
        total_bytes,
        count: count_active,
        trash_bytes,
        trash_count,
        edited_count,
        largest,
        oldest,
        per_collection,
        per_month,
    })
}

/// Active screenshots captured before `cutoff`, optionally excluding favorites.
pub fn older_than(conn: &Connection, cutoff: i64, include_favorites: bool) -> AppResult<(Vec<i64>, i64)> {
    let fav = if include_favorites { "" } else { "AND is_favorite = 0" };
    let mut stmt = conn.prepare(&format!(
        "SELECT id, file_size FROM screenshots WHERE trashed_at IS NULL AND captured_at < ?1 {fav}"
    ))?;
    let rows = stmt.query_map([cutoff], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))?;
    let mut ids = Vec::new();
    let mut bytes = 0;
    for row in rows {
        let (id, size) = row?;
        ids.push(id);
        bytes += size;
    }
    Ok((ids, bytes))
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub key: String,
    /// "exact" (identical bytes) or "similar" (perceptual hash match)
    pub kind: String,
    pub items: Vec<ScreenshotSummary>,
}

fn ignored_pairs(conn: &Connection) -> AppResult<HashSet<(i64, i64)>> {
    let mut stmt = conn.prepare("SELECT a_id, b_id FROM duplicate_ignores")?;
    let set = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<Result<_, _>>()?;
    Ok(set)
}

fn all_pairs_ignored(ids: &[i64], ignored: &HashSet<(i64, i64)>) -> bool {
    for (i, &a) in ids.iter().enumerate() {
        for &b in &ids[i + 1..] {
            let key = (a.min(b), a.max(b));
            if !ignored.contains(&key) {
                return false;
            }
        }
    }
    true
}

pub fn ignore_group(conn: &Connection, ids: &[i64]) -> AppResult<()> {
    let now = now_ms();
    for (i, &a) in ids.iter().enumerate() {
        for &b in &ids[i + 1..] {
            conn.execute(
                "INSERT OR IGNORE INTO duplicate_ignores (a_id, b_id, created_at) VALUES (?1, ?2, ?3)",
                params![a.min(b), a.max(b), now],
            )?;
        }
    }
    Ok(())
}

pub fn exact_duplicates(conn: &Connection) -> AppResult<Vec<DuplicateGroup>> {
    let ignored = ignored_pairs(conn)?;
    let mut stmt = conn.prepare(
        "SELECT sha256, group_concat(id) FROM screenshots WHERE trashed_at IS NULL
         GROUP BY sha256 HAVING count(*) > 1 ORDER BY max(captured_at) DESC",
    )?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    let mut groups = Vec::new();
    for (sha, list) in rows {
        let ids: Vec<i64> = list.split(',').filter_map(|s| s.parse().ok()).collect();
        if all_pairs_ignored(&ids, &ignored) {
            continue;
        }
        groups.push(DuplicateGroup {
            key: sha,
            kind: "exact".into(),
            items: screenshots::summaries_by_ids(conn, &ids)?,
        });
    }
    Ok(groups)
}

fn hamming(a: &[u8], b: &[u8]) -> u32 {
    a.iter().zip(b).map(|(x, y)| (x ^ y).count_ones()).sum()
}

fn find(parent: &mut [usize], mut i: usize) -> usize {
    while parent[i] != i {
        parent[i] = parent[parent[i]];
        i = parent[i];
    }
    i
}

/// Groups visually similar screenshots using their 256-bit difference hash.
/// Exact duplicates are reported separately and skipped here.
pub fn similar_groups(
    conn: &Connection,
    max_distance: u32,
    cancelled: &dyn Fn() -> bool,
) -> AppResult<Vec<DuplicateGroup>> {
    let ignored = ignored_pairs(conn)?;
    let mut stmt = conn.prepare(
        "SELECT id, phash, width, height, sha256 FROM screenshots
         WHERE trashed_at IS NULL AND phash IS NOT NULL ORDER BY captured_at DESC",
    )?;
    let rows: Vec<(i64, Vec<u8>, i64, i64, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))?
        .collect::<Result<_, _>>()?;
    let n = rows.len();
    let mut parent: Vec<usize> = (0..n).collect();
    for i in 0..n {
        if i % 256 == 0 && cancelled() {
            return Err(crate::error::AppError::Cancelled);
        }
        let (a_id, ref a_hash, aw, ah, ref a_sha) = rows[i];
        if a_hash.len() != 32 {
            continue;
        }
        let a_ratio = aw as f64 / ah.max(1) as f64;
        for j in (i + 1)..n {
            let (b_id, ref b_hash, bw, bh, ref b_sha) = rows[j];
            if b_hash.len() != 32 || a_sha == b_sha {
                continue;
            }
            let b_ratio = bw as f64 / bh.max(1) as f64;
            if (a_ratio - b_ratio).abs() / a_ratio.max(b_ratio) > 0.08 {
                continue;
            }
            if hamming(a_hash, b_hash) <= max_distance && !ignored.contains(&(a_id.min(b_id), a_id.max(b_id))) {
                let (ra, rb) = (find(&mut parent, i), find(&mut parent, j));
                if ra != rb {
                    parent[rb] = ra;
                }
            }
        }
    }
    let mut clusters: HashMap<usize, Vec<i64>> = HashMap::new();
    for i in 0..n {
        let root = find(&mut parent, i);
        clusters.entry(root).or_default().push(rows[i].0);
    }
    let mut groups = Vec::new();
    for (_, ids) in clusters {
        if ids.len() < 2 {
            continue;
        }
        groups.push(DuplicateGroup {
            key: format!("similar-{}", ids[0]),
            kind: "similar".into(),
            items: screenshots::summaries_by_ids(conn, &ids)?,
        });
    }
    groups.sort_by(|a, b| {
        let at = a.items.iter().map(|s| s.captured_at).max().unwrap_or(0);
        let bt = b.items.iter().map(|s| s.captured_at).max().unwrap_or(0);
        bt.cmp(&at)
    });
    Ok(groups)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_memory;
    use crate::db::screenshots::tests::sample;

    #[test]
    fn exact_duplicates_grouped_and_ignorable() {
        let conn = open_memory().unwrap();
        let a = screenshots::insert(&conn, &sample("C:/s/a.png", "same", 1)).unwrap();
        let b = screenshots::insert(&conn, &sample("C:/s/b.png", "same", 2)).unwrap();
        screenshots::insert(&conn, &sample("C:/s/c.png", "other", 3)).unwrap();
        let groups = exact_duplicates(&conn).unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].items.len(), 2);
        ignore_group(&conn, &[a, b]).unwrap();
        assert!(exact_duplicates(&conn).unwrap().is_empty());
    }

    #[test]
    fn trashed_items_are_not_duplicates() {
        let conn = open_memory().unwrap();
        screenshots::insert(&conn, &sample("C:/s/a.png", "same", 1)).unwrap();
        let b = screenshots::insert(&conn, &sample("C:/s/b.png", "same", 2)).unwrap();
        screenshots::trash(&conn, &[b]).unwrap();
        assert!(exact_duplicates(&conn).unwrap().is_empty());
    }

    #[test]
    fn similar_groups_use_hamming_distance() {
        let conn = open_memory().unwrap();
        let mut h1 = vec![0u8; 32];
        let mut s1 = sample("C:/s/a.png", "a", 1);
        s1.phash = Some(h1.clone());
        let a = screenshots::insert(&conn, &s1).unwrap();
        h1[0] = 0b0000_0111; // 3 bits different
        let mut s2 = sample("C:/s/b.png", "b", 2);
        s2.phash = Some(h1);
        let b = screenshots::insert(&conn, &s2).unwrap();
        let mut s3 = sample("C:/s/c.png", "c", 3);
        s3.phash = Some(vec![0xFF; 32]);
        screenshots::insert(&conn, &s3).unwrap();

        let groups = similar_groups(&conn, 10, &|| false).unwrap();
        assert_eq!(groups.len(), 1);
        let mut ids: Vec<i64> = groups[0].items.iter().map(|s| s.id).collect();
        ids.sort();
        assert_eq!(ids, vec![a, b]);
        assert!(similar_groups(&conn, 2, &|| false).unwrap().is_empty());
    }

    #[test]
    fn older_than_respects_favorites() {
        let conn = open_memory().unwrap();
        let a = screenshots::insert(&conn, &sample("C:/s/a.png", "a", 100)).unwrap();
        screenshots::insert(&conn, &sample("C:/s/b.png", "b", 100)).unwrap();
        screenshots::insert(&conn, &sample("C:/s/c.png", "c", 900)).unwrap();
        screenshots::set_favorite(&conn, &[a], true).unwrap();
        assert_eq!(older_than(&conn, 500, false).unwrap().0.len(), 1);
        assert_eq!(older_than(&conn, 500, true).unwrap().0.len(), 2);
    }
}
