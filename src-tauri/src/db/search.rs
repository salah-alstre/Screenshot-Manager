//! Full-text search: text normalization, query parsing and FTS index upkeep.
//!
//! Both indexed text and queries go through [`normalize`], which lowercases
//! and folds Arabic letter variants (hamza forms, alef maqsura, taa marbuta),
//! strips tashkeel/tatweel and converts Arabic-Indic digits. The frontend has
//! an identical implementation (`src/utils/normalize.ts`) used for highlighting.

use chrono::{Local, NaiveDate, TimeZone};
use r2d2_sqlite::rusqlite::{params, Connection, OptionalExtension};

use crate::error::AppResult;

pub fn normalize(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        let mapped = match c {
            '\u{0640}' => continue,                                              // tatweel
            '\u{064B}'..='\u{065F}' | '\u{0670}' | '\u{06D6}'..='\u{06ED}' => continue, // tashkeel & marks
            'أ' | 'إ' | 'آ' | 'ٱ' => 'ا',
            'ى' | 'ئ' => 'ي',
            'ؤ' => 'و',
            'ة' => 'ه',
            '٠'..='٩' => char::from_digit(c as u32 - '٠' as u32, 10).unwrap_or(c),
            '۰'..='۹' => char::from_digit(c as u32 - '۰' as u32, 10).unwrap_or(c),
            _ => c,
        };
        out.extend(mapped.to_lowercase());
    }
    out
}

#[derive(Debug, Default, PartialEq)]
pub struct ParsedSearch {
    /// FTS5 MATCH expression, if any free text was given.
    pub fts: Option<String>,
    /// `#tag` tokens (without the hash), matched by tag name.
    pub tag_names: Vec<String>,
    /// Inclusive-exclusive local-time range from a date token like 2026-09-22.
    pub date_range: Option<(i64, i64)>,
}

fn fts_terms(text: &str) -> Vec<String> {
    normalize(text)
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .collect()
}

fn local_ms(date: NaiveDate) -> Option<i64> {
    let dt = date.and_hms_opt(0, 0, 0)?;
    Local.from_local_datetime(&dt).earliest().map(|d| d.timestamp_millis())
}

fn parse_date_token(tok: &str) -> Option<(i64, i64)> {
    let t = tok.replace('/', "-");
    let parts: Vec<&str> = t.split('-').collect();
    match parts.as_slice() {
        [y, m, d] if y.len() == 4 => {
            let date = NaiveDate::from_ymd_opt(y.parse().ok()?, m.parse().ok()?, d.parse().ok()?)?;
            Some((local_ms(date)?, local_ms(date.succ_opt()?)?))
        }
        [y, m] if y.len() == 4 && m.len() <= 2 => {
            let (y, m): (i32, u32) = (y.parse().ok()?, m.parse().ok()?);
            let start = NaiveDate::from_ymd_opt(y, m, 1)?;
            let end = if m == 12 { NaiveDate::from_ymd_opt(y + 1, 1, 1)? } else { NaiveDate::from_ymd_opt(y, m + 1, 1)? };
            Some((local_ms(start)?, local_ms(end)?))
        }
        _ => None,
    }
}

pub fn parse_search(input: &str) -> ParsedSearch {
    let mut parsed = ParsedSearch::default();
    let mut clauses: Vec<String> = Vec::new();

    // Extract quoted phrases first.
    let mut rest = String::new();
    let mut in_quote = false;
    let mut phrase = String::new();
    for c in input.chars() {
        if c == '"' {
            if in_quote {
                let terms = fts_terms(&phrase);
                if !terms.is_empty() {
                    clauses.push(format!("\"{}\"", terms.join(" ")));
                }
                phrase.clear();
            }
            in_quote = !in_quote;
        } else if in_quote {
            phrase.push(c);
        } else {
            rest.push(c);
        }
    }
    if in_quote {
        rest.push_str(&phrase);
    }

    for tok in rest.split_whitespace() {
        if let Some(tag) = tok.strip_prefix('#') {
            if !tag.is_empty() {
                parsed.tag_names.push(tag.to_string());
            }
            continue;
        }
        if parsed.date_range.is_none() {
            if let Some(range) = parse_date_token(tok) {
                parsed.date_range = Some(range);
                continue;
            }
        }
        for term in fts_terms(tok) {
            clauses.push(format!("\"{term}\"*"));
        }
    }
    if !clauses.is_empty() {
        parsed.fts = Some(clauses.join(" AND "));
    }
    parsed
}

/// Rebuild the FTS row for one screenshot from its current data.
pub fn reindex(conn: &Connection, id: i64) -> AppResult<()> {
    let row: Option<(String, Option<String>, Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT s.name, o.text, n.body, c.name
             FROM screenshots s
             LEFT JOIN ocr_data o ON o.screenshot_id = s.id
             LEFT JOIN notes n ON n.screenshot_id = s.id
             LEFT JOIN collections c ON c.id = s.collection_id
             WHERE s.id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()?;
    conn.execute("DELETE FROM search_fts WHERE rowid = ?1", [id])?;
    let Some((name, ocr, note, collection)) = row else { return Ok(()) };
    let tags: String = conn.query_row(
        "SELECT COALESCE(group_concat(t.name, ' '), '') FROM screenshot_tags st
         JOIN tags t ON t.id = st.tag_id WHERE st.screenshot_id = ?1",
        [id],
        |r| r.get(0),
    )?;
    conn.execute(
        "INSERT INTO search_fts(rowid, name, ocr, notes, tags, collection) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            id,
            normalize(&name),
            normalize(ocr.as_deref().unwrap_or("")),
            normalize(note.as_deref().unwrap_or("")),
            normalize(&tags),
            normalize(collection.as_deref().unwrap_or("")),
        ],
    )?;
    Ok(())
}

pub fn reindex_many(conn: &Connection, ids: &[i64]) -> AppResult<()> {
    for &id in ids {
        reindex(conn, id)?;
    }
    Ok(())
}

pub fn remove(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM search_fts WHERE rowid = ?1", [id])?;
    Ok(())
}

pub fn rebuild_all(conn: &Connection) -> AppResult<usize> {
    conn.execute("DELETE FROM search_fts", [])?;
    let ids: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT id FROM screenshots")?;
        let rows = stmt.query_map([], |r| r.get(0))?;
        rows.collect::<Result<_, _>>()?
    };
    reindex_many(conn, &ids)?;
    Ok(ids.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_arabic_variants() {
        assert_eq!(normalize("أحمد"), normalize("احمد"));
        assert_eq!(normalize("مدرسة"), "مدرسه");
        assert_eq!(normalize("مُحَمَّد"), "محمد");
        assert_eq!(normalize("علـــي"), "علي");
        assert_eq!(normalize("٢٠٢٦"), "2026");
        assert_eq!(normalize("Cloudflare R2"), "cloudflare r2");
    }

    #[test]
    fn parses_terms_as_prefix_queries() {
        let p = parse_search("Cloud next.js");
        assert_eq!(p.fts.as_deref(), Some("\"cloud\"* AND \"next\"* AND \"js\"*"));
        assert!(p.tag_names.is_empty());
    }

    #[test]
    fn parses_tags_phrases_and_dates() {
        let p = parse_search("#bug \"build failed\" 2026-09-22");
        assert_eq!(p.tag_names, vec!["bug".to_string()]);
        assert_eq!(p.fts.as_deref(), Some("\"build failed\""));
        let (a, b) = p.date_range.unwrap();
        assert!(b - a >= 23 * 3600 * 1000 && b - a <= 25 * 3600 * 1000);
    }

    #[test]
    fn month_token_spans_month() {
        let p = parse_search("2026-02");
        let (a, b) = p.date_range.unwrap();
        let days = (b - a) / (24 * 3600 * 1000);
        assert_eq!(days, 28);
    }

    #[test]
    fn empty_query_has_no_fts() {
        assert_eq!(parse_search("   ").fts, None);
        assert_eq!(parse_search("...").fts, None);
    }
}
