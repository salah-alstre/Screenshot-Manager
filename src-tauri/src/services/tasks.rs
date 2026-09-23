//! Background task tracking. Long-running work (OCR, imports, exports,
//! duplicate scans, index rebuilds) registers a task so the UI can show
//! progress and offer cancellation.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInfo {
    pub id: u64,
    /// ocr | import | export | duplicates | thumbnails | reindex | cleanup
    pub kind: String,
    pub done: u64,
    pub total: u64,
    /// running | done | failed | cancelled
    pub state: String,
    pub cancellable: bool,
}

type CancelFn = Box<dyn Fn() + Send + Sync>;

struct Entry {
    info: TaskInfo,
    flag: Arc<AtomicBool>,
    on_cancel: Option<CancelFn>,
}

#[derive(Default)]
pub struct TaskManager {
    next: AtomicU64,
    tasks: Arc<Mutex<HashMap<u64, Entry>>>,
}

impl TaskManager {
    pub fn start(&self, app: &AppHandle, kind: &str, total: u64, on_cancel: Option<CancelFn>) -> TaskHandle {
        let id = self.next.fetch_add(1, Ordering::SeqCst) + 1;
        let flag = Arc::new(AtomicBool::new(false));
        let info = TaskInfo { id, kind: kind.into(), done: 0, total, state: "running".into(), cancellable: true };
        self.tasks.lock().insert(id, Entry { info: info.clone(), flag: flag.clone(), on_cancel });
        let _ = app.emit("task-progress", &info);
        TaskHandle {
            id,
            app: app.clone(),
            flag,
            tasks: self.tasks.clone(),
            last_emit: Mutex::new(Instant::now() - Duration::from_secs(1)),
        }
    }

    pub fn list(&self) -> Vec<TaskInfo> {
        let mut v: Vec<TaskInfo> = self.tasks.lock().values().map(|e| e.info.clone()).collect();
        v.sort_by_key(|t| t.id);
        v
    }

    pub fn cancel(&self, id: u64) {
        let tasks = self.tasks.lock();
        if let Some(entry) = tasks.get(&id) {
            entry.flag.store(true, Ordering::SeqCst);
            if let Some(cb) = &entry.on_cancel {
                cb();
            }
        }
    }
}

pub struct TaskHandle {
    id: u64,
    app: AppHandle,
    flag: Arc<AtomicBool>,
    tasks: Arc<Mutex<HashMap<u64, Entry>>>,
    last_emit: Mutex<Instant>,
}

impl TaskHandle {
    pub fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::SeqCst)
    }

    pub fn set_progress(&self, done: u64, total: u64) {
        let info = {
            let mut tasks = self.tasks.lock();
            let Some(entry) = tasks.get_mut(&self.id) else { return };
            entry.info.done = done;
            entry.info.total = total;
            entry.info.clone()
        };
        let mut last = self.last_emit.lock();
        if last.elapsed() >= Duration::from_millis(120) || done >= total {
            *last = Instant::now();
            let _ = self.app.emit("task-progress", &info);
        }
    }

    pub fn finish(&self, state: &str) {
        let info = {
            let mut tasks = self.tasks.lock();
            tasks.remove(&self.id).map(|mut e| {
                e.info.state = state.into();
                e.info
            })
        };
        if let Some(info) = info {
            let _ = self.app.emit("task-progress", &info);
        }
    }
}

impl Drop for TaskHandle {
    fn drop(&mut self) {
        // Tasks that end without an explicit finish (e.g. early `?` return) are reported as failed.
        if self.tasks.lock().contains_key(&self.id) {
            self.finish(if self.is_cancelled() { "cancelled" } else { "failed" });
        }
    }
}
