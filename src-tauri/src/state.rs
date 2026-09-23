//! Shared application state managed by Tauri.

use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::{Mutex, RwLock};

use crate::db::settings::Settings;
use crate::db::Pool;
use crate::services::capture::CaptureState;
use crate::services::ocr::OcrQueue;
use crate::services::paths::{self, AppPaths};
use crate::services::tasks::TaskManager;
use crate::services::watcher::WatcherService;

pub struct AppState {
    pub pool: Pool,
    pub paths: AppPaths,
    pub settings: RwLock<Settings>,
    pub tasks: TaskManager,
    pub ocr: Arc<OcrQueue>,
    pub capture: CaptureState,
    pub watcher: WatcherService,
    /// Registered global shortcut string -> action name.
    pub hotkeys: Mutex<Vec<(String, String)>>,
}

impl AppState {
    pub fn library_root(&self) -> PathBuf {
        paths::library_root(&self.settings.read().library_root, &self.paths)
    }
}
