//! Watches user-selected folders and imports new images automatically.
//!
//! Files are imported only once their size has been stable for a moment and
//! they can be opened, so screenshots still being written are not read early.
//! Watched files are referenced in place (never moved or copied).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use tauri::{AppHandle, Manager};

use super::library::{self, ImportMode};
use super::paths::has_supported_extension;
use crate::db::watched;
use crate::state::AppState;

struct Pending {
    size: u64,
    stable_since: Instant,
}

#[derive(Default)]
pub struct WatcherService {
    watcher: Mutex<Option<RecommendedWatcher>>,
    pending: Arc<Mutex<HashMap<PathBuf, Pending>>>,
    loop_started: AtomicBool,
    watched_count: Mutex<usize>,
}

impl WatcherService {
    pub fn watched_count(&self) -> usize {
        *self.watched_count.lock()
    }

    /// (Re)creates the OS watcher for all enabled folders.
    pub fn restart(&self, app: &AppHandle) {
        let state = app.state::<AppState>();
        let folders = state.pool.get().ok().and_then(|c| watched::list(&c).ok()).unwrap_or_default();
        let pending = self.pending.clone();
        let handler = move |res: notify::Result<notify::Event>| {
            let Ok(event) = res else { return };
            if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                return;
            }
            let mut pending = pending.lock();
            for path in event.paths {
                if has_supported_extension(&path) {
                    pending.entry(path).or_insert(Pending { size: u64::MAX, stable_since: Instant::now() });
                }
            }
        };
        let mut guard = self.watcher.lock();
        *guard = None;
        let mut count = 0;
        match notify::recommended_watcher(handler) {
            Ok(mut w) => {
                for f in folders.iter().filter(|f| f.enabled && f.available) {
                    match w.watch(std::path::Path::new(&f.path), RecursiveMode::NonRecursive) {
                        Ok(()) => count += 1,
                        Err(e) => log::warn!("cannot watch folder #{}: {e}", f.id),
                    }
                }
                *guard = Some(w);
            }
            Err(e) => log::error!("file watcher unavailable: {e}"),
        }
        *self.watched_count.lock() = count;
        drop(guard);
        self.start_loop(app.clone());
    }

    fn start_loop(&self, app: AppHandle) {
        if self.loop_started.swap(true, Ordering::SeqCst) {
            return;
        }
        let pending = self.pending.clone();
        std::thread::Builder::new()
            .name("snapvault-watcher".into())
            .spawn(move || loop {
                std::thread::sleep(Duration::from_millis(800));
                let ready: Vec<PathBuf> = {
                    let mut map = pending.lock();
                    let mut ready = Vec::new();
                    map.retain(|path, p| {
                        let Ok(meta) = std::fs::metadata(path) else { return false };
                        let size = meta.len();
                        if size != p.size {
                            p.size = size;
                            p.stable_since = Instant::now();
                            return true;
                        }
                        if p.stable_since.elapsed() >= Duration::from_millis(1200) && size > 0 {
                            if std::fs::File::open(path).is_ok() {
                                ready.push(path.clone());
                                return false;
                            }
                        }
                        // Give up on files that never settle.
                        p.stable_since.elapsed() < Duration::from_secs(120)
                    });
                    ready
                };
                if ready.is_empty() {
                    continue;
                }
                let Some(state) = app.try_state::<AppState>() else { continue };
                if state.settings.read().monitoring_paused {
                    continue;
                }
                let report = library::import_paths(&app, ready, ImportMode::Reference, "watch");
                if report.imported > 0 {
                    crate::services::notify::imported(&app, report.imported);
                    crate::events::import_finished(&app, &report);
                }
            })
            .expect("spawn watcher thread");
    }
}

/// Imports images already present in watched folders but not yet in the
/// library (e.g. added while SnapVault was closed).
pub fn catch_up(app: &AppHandle, folder_id: Option<i64>) {
    let app = app.clone();
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        if state.settings.read().monitoring_paused && folder_id.is_none() {
            return;
        }
        let (folders, known) = {
            let Ok(conn) = state.pool.get() else { return };
            let folders = watched::list(&conn).unwrap_or_default();
            let known = crate::db::screenshots::all_paths(&conn).unwrap_or_default();
            (folders, known)
        };
        let mut files = Vec::new();
        for f in folders.iter().filter(|f| f.enabled && f.available && folder_id.is_none_or(|id| id == f.id)) {
            for p in library::images_in_dir(std::path::Path::new(&f.path)) {
                if !known.contains(&p.to_string_lossy().to_lowercase()) {
                    files.push(p);
                }
            }
        }
        if files.is_empty() {
            return;
        }
        let report = library::import_paths(&app, files, ImportMode::Reference, "watch");
        if report.imported > 0 {
            crate::events::import_finished(&app, &report);
        }
    });
}
