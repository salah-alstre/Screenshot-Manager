//! SnapVault — local-first screenshot manager.

pub mod commands;
pub mod db;
pub mod error;
pub mod events;
pub mod hotkeys;
pub mod native;
pub mod protocol;
pub mod services;
pub mod state;
pub mod tray;

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use parking_lot::{Mutex, RwLock};
use tauri::{AppHandle, DragDropEvent, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_window_state::StateFlags;

use crate::services::paths::AppPaths;
use crate::state::AppState;

/// Set when the user chose Quit, so closing isn't intercepted.
pub static QUITTING: AtomicBool = AtomicBool::new(false);
/// Set when launched by Windows at sign-in (`--minimized`): stay in the tray.
pub static START_MINIMIZED: AtomicBool = AtomicBool::new(false);

pub fn show_main_window(app: &AppHandle) {
    START_MINIMIZED.store(false, Ordering::SeqCst);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Existing files passed on the command line (flags are ignored).
fn file_args(args: &[String], cwd: Option<&std::path::Path>) -> Vec<std::path::PathBuf> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with("--"))
        .map(|a| {
            let p = std::path::PathBuf::from(a);
            match (p.is_absolute(), cwd) {
                (false, Some(dir)) => dir.join(p),
                _ => p,
            }
        })
        .filter(|p| p.is_file() || p.is_dir())
        .collect()
}

fn create_aux_windows(app: &AppHandle) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into()))
        .title("SnapVault Capture")
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .visible(false)
        .drag_and_drop(false)
        .background_color(tauri::window::Color(0, 0, 0, 255))
        .build()?;
    WebviewWindowBuilder::new(app, "popup", WebviewUrl::App("popup.html".into()))
        .title("SnapVault")
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .transparent(true)
        .focused(false)
        .visible(false)
        .drag_and_drop(false)
        .inner_size(services::capture::POPUP_W, services::capture::POPUP_H)
        .build()?;
    Ok(())
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    START_MINIMIZED.store(std::env::args().any(|a| a == "--minimized"), Ordering::SeqCst);
    log::info!("SnapVault {} starting", app.package_info().version);

    let data_dir = app.path().app_data_dir()?;
    let logs_dir = app.path().app_log_dir()?;
    let pictures = app.path().picture_dir().or_else(|_| app.path().home_dir().map(|h| h.join("Pictures")))?;
    let paths = AppPaths::new(data_dir, logs_dir, pictures)?;
    let pool = db::open_pool(&paths.db_path)?;
    let settings = db::settings::load(&*pool.get()?)?;

    app.manage(AppState {
        pool,
        paths,
        settings: RwLock::new(settings.clone()),
        tasks: Default::default(),
        ocr: services::ocr::OcrQueue::new(),
        capture: Default::default(),
        watcher: Default::default(),
        hotkeys: Mutex::new(Vec::new()),
    });

    create_aux_windows(&handle)?;
    tray::create(&handle)?;
    let failed = hotkeys::register_all(&handle, &settings.hotkeys);
    if !failed.is_empty() {
        log::warn!("some global shortcuts could not be registered: {failed:?}");
    }

    let state = handle.state::<AppState>();
    state.ocr.start_worker(handle.clone());
    state.watcher.restart(&handle);
    services::watcher::catch_up(&handle, None);

    let args: Vec<String> = std::env::args().collect();
    let initial_files = file_args(&args, std::env::current_dir().ok().as_deref());
    if !initial_files.is_empty() {
        commands::files::import_dropped(&handle, initial_files);
    }

    // Resume OCR for screenshots left pending by a previous session.
    if settings.ocr_enabled && settings.auto_ocr {
        if let Ok(conn) = state.pool.get() {
            let pending: Vec<i64> = conn
                .prepare("SELECT id FROM screenshots WHERE trashed_at IS NULL AND ocr_status = 'pending'")
                .and_then(|mut s| s.query_map([], |r| r.get(0))?.collect())
                .unwrap_or_default();
            state.ocr.enqueue(&handle, &pending);
        }
    }

    // Periodic trash retention (only when the user enabled auto-delete).
    let h = handle.clone();
    std::thread::spawn(move || loop {
        purge_expired_trash(&h);
        std::thread::sleep(Duration::from_secs(6 * 3600));
    });

    // Fallback in case the UI never reports ready (e.g. a frontend crash).
    let h = handle.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(5));
        if !START_MINIMIZED.load(Ordering::SeqCst) {
            if let Some(w) = h.get_webview_window("main") {
                if !w.is_visible().unwrap_or(true) {
                    show_main_window(&h);
                }
            }
        }
    });
    Ok(())
}

fn purge_expired_trash(app: &AppHandle) {
    let state = app.state::<AppState>();
    let days = state.settings.read().trash_auto_delete_days;
    if days == 0 {
        return;
    }
    let cutoff = db::now_ms() - days as i64 * 86_400_000;
    let ids = match state.pool.get().map_err(error::AppError::from).and_then(|c| db::screenshots::trashed_before(&c, cutoff)) {
        Ok(ids) => ids,
        Err(e) => return log::error!("trash retention query failed: {e}"),
    };
    if ids.is_empty() {
        return;
    }
    match services::library::delete_permanently(&state, &ids) {
        Ok(n) => {
            log::info!("trash retention removed {n} screenshots older than {days} days");
            events::library_changed(app);
        }
        Err(e) => log::error!("trash retention failed: {e}"),
    }
}

pub fn run() {
    let log_plugin = tauri_plugin_log::Builder::new()
        .targets([
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: Some("snapvault".into()) }),
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
        ])
        .level(log::LevelFilter::Info)
        .level_for("tao", log::LevelFilter::Warn)
        .level_for("wry", log::LevelFilter::Warn)
        .max_file_size(5 * 1024 * 1024)
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5))
        .build();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            // `snapvault.exe <images…>` (e.g. "Send to") imports into the running instance.
            let files = file_args(&args, Some(std::path::Path::new(&cwd)));
            if files.is_empty() {
                show_main_window(app);
            } else {
                commands::files::import_dropped(app, files);
            }
        }))
        .plugin(log_plugin)
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_denylist(&["overlay", "popup"])
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| hotkeys::on_shortcut(app, shortcut, event.state()))
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_opener::init())
        .register_asynchronous_uri_scheme_protocol("sv", |ctx, request, responder| {
            protocol::handle(ctx.app_handle(), request, responder)
        })
        .setup(setup)
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    let app = window.app_handle();
                    let to_tray = app.state::<AppState>().settings.read().close_to_tray;
                    if to_tray && !QUITTING.load(Ordering::SeqCst) {
                        api.prevent_close();
                        let _ = window.hide();
                        let shown = app.state::<AppState>().settings.read().tray_hint_shown;
                        if !shown {
                            services::notify::still_running(app);
                            let _ = commands::settings::apply_patch(app, serde_json::json!({ "trayHintShown": true }));
                        }
                    } else {
                        QUITTING.store(true, Ordering::SeqCst);
                        app.exit(0);
                    }
                }
                WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) => {
                    commands::files::import_dropped(window.app_handle(), paths.clone());
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::library::list_screenshots,
            commands::library::list_screenshot_ids,
            commands::library::search_ocr,
            commands::library::get_screenshot,
            commands::library::get_summaries,
            commands::library::set_favorite,
            commands::library::move_to_collection,
            commands::library::trash_screenshots,
            commands::library::restore_screenshots,
            commands::library::delete_permanently,
            commands::library::empty_trash,
            commands::library::rename_screenshot,
            commands::library::save_note,
            commands::library::copy_image,
            commands::library::copy_text,
            commands::library::open_file_location,
            commands::library::revert_edit,
            commands::organize::list_collections,
            commands::organize::create_collection,
            commands::organize::update_collection,
            commands::organize::delete_collection,
            commands::organize::list_tags,
            commands::organize::create_tag,
            commands::organize::update_tag,
            commands::organize::delete_tag,
            commands::organize::add_tag,
            commands::organize::add_tag_by_name,
            commands::organize::remove_tag,
            commands::ocr::ocr_languages,
            commands::ocr::run_ocr,
            commands::ocr::run_ocr_pending,
            commands::ocr::rebuild_ocr_index,
            commands::ocr::update_ocr_text,
            commands::capture::start_capture,
            commands::capture::list_monitors,
            commands::capture::overlay_finish,
            commands::capture::popup_action,
            commands::files::import_dialog,
            commands::files::list_watched_folders,
            commands::files::suggested_watch_folder,
            commands::files::add_watched_folder,
            commands::files::add_suggested_watch_folder,
            commands::files::set_watched_folder_enabled,
            commands::files::remove_watched_folder,
            commands::files::choose_library_root,
            commands::files::export_screenshots,
            commands::files::export_collection,
            commands::files::open_folder,
            commands::files::save_edit,
            commands::files::copy_png,
            commands::files::export_png,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::hotkey_status,
            commands::settings::set_hotkeys_suspended,
            commands::settings::app_info,
            commands::settings::check_for_updates,
            commands::settings::open_logs_folder,
            commands::settings::open_data_folder,
            commands::settings::open_library_folder,
            commands::settings::rebuild_search_index,
            commands::settings::regenerate_thumbnails,
            commands::settings::app_ready,
            commands::settings::default_library_root,
            commands::settings::tray_hint,
            commands::stats::dashboard_stats,
            commands::stats::status_info,
            commands::stats::storage_stats,
            commands::stats::cleanup_preview,
            commands::stats::cleanup_old,
            commands::stats::scan_duplicates,
            commands::stats::ignore_duplicates,
            commands::stats::list_tasks,
            commands::stats::cancel_task,
        ])
        .build(tauri::generate_context!())
        .expect("error while building SnapVault")
        .run(|app, event| {
            if let RunEvent::ExitRequested { api, code, .. } = event {
                // Hidden windows keep the app alive in the tray; only exit on explicit quit.
                if code.is_none() && !QUITTING.load(Ordering::SeqCst) {
                    api.prevent_exit();
                }
                let _ = app;
            }
        });
}
