//! Forward-only schema migrations tracked with `PRAGMA user_version`.
//! Each migration runs in its own transaction. Never edit a shipped migration;
//! append a new one instead.

use r2d2_sqlite::rusqlite::Connection;

use crate::error::AppResult;

const MIGRATIONS: &[&str] = &[
    // v1 — initial schema
    r#"
    CREATE TABLE collections (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        icon        TEXT NOT NULL DEFAULT 'folder',
        color       TEXT NOT NULL DEFAULT 'blue',
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX idx_collections_name ON collections(name COLLATE NOCASE);

    CREATE TABLE screenshots (
        id              INTEGER PRIMARY KEY,
        file_path       TEXT NOT NULL UNIQUE,
        edited_path     TEXT,
        name            TEXT NOT NULL,
        format          TEXT NOT NULL,
        width           INTEGER NOT NULL,
        height          INTEGER NOT NULL,
        file_size       INTEGER NOT NULL,
        sha256          TEXT NOT NULL,
        phash           BLOB,
        source          TEXT NOT NULL,
        capture_mode    TEXT,
        source_monitor  TEXT,
        owned           INTEGER NOT NULL DEFAULT 0,
        collection_id   INTEGER REFERENCES collections(id) ON DELETE SET NULL,
        is_favorite     INTEGER NOT NULL DEFAULT 0,
        favorited_at    INTEGER,
        captured_at     INTEGER NOT NULL,
        file_created_at INTEGER,
        file_modified_at INTEGER,
        imported_at     INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        trashed_at      INTEGER,
        ocr_status      TEXT NOT NULL DEFAULT 'none',
        missing         INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_shots_captured ON screenshots(captured_at DESC);
    CREATE INDEX idx_shots_imported ON screenshots(imported_at DESC);
    CREATE INDEX idx_shots_trashed ON screenshots(trashed_at);
    CREATE INDEX idx_shots_collection ON screenshots(collection_id);
    CREATE INDEX idx_shots_favorite ON screenshots(is_favorite) WHERE is_favorite = 1;
    CREATE INDEX idx_shots_sha ON screenshots(sha256);
    CREATE INDEX idx_shots_size ON screenshots(file_size DESC);
    CREATE INDEX idx_shots_ocr ON screenshots(ocr_status);

    CREATE TABLE tags (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        color       TEXT NOT NULL DEFAULT 'blue',
        created_at  INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX idx_tags_name ON tags(name COLLATE NOCASE);

    CREATE TABLE screenshot_tags (
        screenshot_id INTEGER NOT NULL REFERENCES screenshots(id) ON DELETE CASCADE,
        tag_id        INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        created_at    INTEGER NOT NULL,
        PRIMARY KEY (screenshot_id, tag_id)
    ) WITHOUT ROWID;
    CREATE INDEX idx_screenshot_tags_tag ON screenshot_tags(tag_id);

    CREATE TABLE ocr_data (
        screenshot_id INTEGER PRIMARY KEY REFERENCES screenshots(id) ON DELETE CASCADE,
        text          TEXT NOT NULL,
        words_json    TEXT,
        language      TEXT NOT NULL,
        engine        TEXT NOT NULL,
        edited        INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
    );

    CREATE TABLE notes (
        screenshot_id INTEGER PRIMARY KEY REFERENCES screenshots(id) ON DELETE CASCADE,
        body          TEXT NOT NULL,
        updated_at    INTEGER NOT NULL
    );

    CREATE TABLE settings (
        key         TEXT PRIMARY KEY,
        value       TEXT NOT NULL,
        updated_at  INTEGER NOT NULL
    );

    CREATE TABLE watched_folders (
        id          INTEGER PRIMARY KEY,
        path        TEXT NOT NULL UNIQUE,
        enabled     INTEGER NOT NULL DEFAULT 1,
        created_at  INTEGER NOT NULL
    );

    CREATE TABLE duplicate_ignores (
        a_id INTEGER NOT NULL REFERENCES screenshots(id) ON DELETE CASCADE,
        b_id INTEGER NOT NULL REFERENCES screenshots(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (a_id, b_id)
    ) WITHOUT ROWID;

    -- Full-text index. Text is stored pre-normalized (see search::normalize)
    -- so Arabic letter variants and diacritics match consistently.
    CREATE VIRTUAL TABLE search_fts USING fts5(
        name, ocr, notes, tags, collection,
        tokenize = 'unicode61 remove_diacritics 2'
    );
    "#,
    // v2 — image version for cache busting (changes only when pixels change)
    r#"
    ALTER TABLE screenshots ADD COLUMN image_version INTEGER NOT NULL DEFAULT 0;
    "#,
];

pub fn migrate(conn: &mut Connection) -> AppResult<()> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (i, sql) in MIGRATIONS.iter().enumerate() {
        let version = (i + 1) as i64;
        if version <= current {
            continue;
        }
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", version)?;
        tx.commit()?;
        log::info!("database migrated to schema v{version}");
    }
    Ok(())
}

pub fn schema_version() -> i64 {
    MIGRATIONS.len() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_idempotent() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&mut conn).unwrap();
        migrate(&mut conn).unwrap();
        let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, schema_version());
    }

    #[test]
    fn fts5_is_available() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO search_fts(rowid, name, ocr, notes, tags, collection) VALUES (1, 'a', 'cloudflare r2', '', '', '')",
            [],
        )
        .unwrap();
        let n: i64 = conn
            .query_row("SELECT count(*) FROM search_fts WHERE search_fts MATCH '\"cloud\"*'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
    }
}
