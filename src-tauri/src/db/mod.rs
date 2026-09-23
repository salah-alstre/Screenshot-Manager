//! SQLite storage. Repository functions take a `&Connection` so they can run
//! inside transactions and be unit-tested against in-memory databases.

pub mod collections;
pub mod migrations;
pub mod models;
pub mod screenshots;
pub mod search;
pub mod settings;
pub mod stats;
pub mod tags;
pub mod watched;

use std::path::Path;

use r2d2_sqlite::rusqlite::Connection;
use r2d2_sqlite::SqliteConnectionManager;

use crate::error::AppResult;

pub type Pool = r2d2::Pool<SqliteConnectionManager>;
pub type PooledConn = r2d2::PooledConnection<SqliteConnectionManager>;

// busy_timeout comes first so concurrent connections wait instead of failing.
const PRAGMAS: &str = "PRAGMA busy_timeout = 5000;
     PRAGMA foreign_keys = ON;
     PRAGMA synchronous = NORMAL;
     PRAGMA temp_store = MEMORY;";

pub fn open_pool(path: &Path) -> AppResult<Pool> {
    // WAL is persistent: enable it once before the pool opens its connections.
    Connection::open(path)?.execute_batch("PRAGMA journal_mode = WAL;")?;
    let manager = SqliteConnectionManager::file(path).with_init(|c| c.execute_batch(PRAGMAS));
    let pool = r2d2::Pool::builder().max_size(6).build(manager)?;
    {
        let mut conn = pool.get()?;
        migrations::migrate(&mut conn)?;
    }
    Ok(pool)
}

/// In-memory database with the full schema, used by tests.
pub fn open_memory() -> AppResult<Connection> {
    let mut conn = Connection::open_in_memory()?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    migrations::migrate(&mut conn)?;
    Ok(conn)
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
