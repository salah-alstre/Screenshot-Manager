// Typed wrappers around the Rust IPC commands (src-tauri/src/commands).
import { invoke } from "@tauri-apps/api/core";
import type {
  AppInfo,
  CaptureKind,
  Collection,
  DashboardStats,
  DuplicateReport,
  ExportResult,
  ImportReport,
  ListQuery,
  MonitorInfo,
  OcrHit,
  OcrLanguages,
  Page,
  Rect,
  ScreenshotDetail,
  ScreenshotSummary,
  Settings,
  SettingsPatch,
  SettingsUpdate,
  StatusInfo,
  StorageStats,
  Tag,
  TaskInfo,
  WatchedFolder,
} from "@/types/models";

export type EditSaveMode = "keep" | "copy" | "replace";

export const api = {
  // Library
  listScreenshots: (query: ListQuery) => invoke<Page<ScreenshotSummary>>("list_screenshots", { query }),
  listScreenshotIds: (query: ListQuery) => invoke<number[]>("list_screenshot_ids", { query }),
  searchOcr: (query: ListQuery) => invoke<Page<OcrHit>>("search_ocr", { query }),
  getScreenshot: (id: number) => invoke<ScreenshotDetail>("get_screenshot", { id }),
  getSummaries: (ids: number[]) => invoke<ScreenshotSummary[]>("get_summaries", { ids }),
  setFavorite: (ids: number[], favorite: boolean) => invoke<number>("set_favorite", { ids, favorite }),
  moveToCollection: (ids: number[], collectionId: number | null) =>
    invoke<number>("move_to_collection", { ids, collectionId }),
  trash: (ids: number[]) => invoke<number>("trash_screenshots", { ids }),
  restore: (ids: number[]) => invoke<number>("restore_screenshots", { ids }),
  deletePermanently: (ids: number[]) => invoke<number>("delete_permanently", { ids }),
  emptyTrash: () => invoke<number>("empty_trash"),
  rename: (id: number, name: string) => invoke<void>("rename_screenshot", { id, name }),
  saveNote: (id: number, body: string) => invoke<void>("save_note", { id, body }),
  copyImage: (id: number) => invoke<void>("copy_image", { id }),
  copyText: (text: string) => invoke<void>("copy_text", { text }),
  openFileLocation: (id: number) => invoke<void>("open_file_location", { id }),
  revertEdit: (id: number) => invoke<void>("revert_edit", { id }),

  // Collections & tags
  listCollections: () => invoke<Collection[]>("list_collections"),
  createCollection: (name: string, icon: string, color: string) =>
    invoke<Collection>("create_collection", { name, icon, color }),
  updateCollection: (id: number, name: string, icon: string, color: string) =>
    invoke<Collection>("update_collection", { id, name, icon, color }),
  deleteCollection: (id: number) => invoke<void>("delete_collection", { id }),
  listTags: () => invoke<Tag[]>("list_tags"),
  createTag: (name: string, color: string) => invoke<Tag>("create_tag", { name, color }),
  updateTag: (id: number, name: string, color: string) => invoke<Tag>("update_tag", { id, name, color }),
  deleteTag: (id: number) => invoke<void>("delete_tag", { id }),
  addTag: (ids: number[], tagId: number) => invoke<number>("add_tag", { ids, tagId }),
  addTagByName: (ids: number[], name: string, color: string) => invoke<Tag>("add_tag_by_name", { ids, name, color }),
  removeTag: (ids: number[], tagId: number) => invoke<number>("remove_tag", { ids, tagId }),

  // OCR
  ocrLanguages: () => invoke<OcrLanguages>("ocr_languages"),
  runOcr: (ids: number[]) => invoke<number>("run_ocr", { ids }),
  runOcrPending: () => invoke<number>("run_ocr_pending"),
  rebuildOcrIndex: () => invoke<number>("rebuild_ocr_index"),
  updateOcrText: (id: number, text: string) => invoke<void>("update_ocr_text", { id, text }),

  // Capture
  startCapture: (kind: CaptureKind, monitor?: number) => invoke<void>("start_capture", { kind, monitor }),
  listMonitors: () => invoke<MonitorInfo[]>("list_monitors"),
  overlayFinish: (sessionId: number, action: "save" | "copy" | "edit" | "cancel", rect: Rect | null) =>
    invoke<void>("overlay_finish", { sessionId, action, rect }),
  popupAction: (action: "copy" | "open" | "edit" | "delete", id: number) => invoke<void>("popup_action", { action, id }),

  // Files
  importDialog: () => invoke<ImportReport>("import_dialog"),
  listWatchedFolders: () => invoke<WatchedFolder[]>("list_watched_folders"),
  suggestedWatchFolder: () => invoke<string | null>("suggested_watch_folder"),
  addWatchedFolder: () => invoke<WatchedFolder>("add_watched_folder"),
  addSuggestedWatchFolder: () => invoke<WatchedFolder>("add_suggested_watch_folder"),
  setWatchedFolderEnabled: (id: number, enabled: boolean) =>
    invoke<void>("set_watched_folder_enabled", { id, enabled }),
  removeWatchedFolder: (id: number) => invoke<void>("remove_watched_folder", { id }),
  chooseLibraryRoot: () => invoke<string>("choose_library_root"),
  exportScreenshots: (ids: number[], format: string, quality: number) =>
    invoke<ExportResult>("export_screenshots", { ids, format, quality }),
  exportCollection: (collectionId: number, format: string, quality: number) =>
    invoke<ExportResult>("export_collection", { collectionId, format, quality }),
  openFolder: (path: string) => invoke<void>("open_folder", { path }),
  saveEdit: (id: number, png: Uint8Array, mode: EditSaveMode) =>
    invoke<number>("save_edit", png, { headers: { "x-sv-id": String(id), "x-sv-mode": mode } }),
  copyPng: (png: Uint8Array) => invoke<void>("copy_png", png),
  exportPng: (png: Uint8Array, name: string, format: string, quality: number) =>
    invoke<string>("export_png", png, {
      headers: { "x-sv-format": format, "x-sv-quality": String(quality), "x-sv-name": encodeURIComponent(name) },
    }),

  // Settings & app
  getSettings: () => invoke<Settings>("get_settings"),
  updateSettings: (patch: SettingsPatch) => invoke<SettingsUpdate>("update_settings", { patch }),
  hotkeyStatus: () => invoke<string[]>("hotkey_status"),
  setHotkeysSuspended: (suspended: boolean) => invoke<string[]>("set_hotkeys_suspended", { suspended }),
  appInfo: () => invoke<AppInfo>("app_info"),
  checkForUpdates: () => invoke<{ status: string; currentVersion: string }>("check_for_updates"),
  openLogsFolder: () => invoke<void>("open_logs_folder"),
  openDataFolder: () => invoke<void>("open_data_folder"),
  openLibraryFolder: () => invoke<void>("open_library_folder"),
  rebuildSearchIndex: () => invoke<number>("rebuild_search_index"),
  regenerateThumbnails: () => invoke<number>("regenerate_thumbnails"),
  appReady: () => invoke<void>("app_ready"),
  defaultLibraryRoot: () => invoke<string>("default_library_root"),

  // Stats & tasks
  dashboardStats: (todayStart: number, weekStart: number) =>
    invoke<DashboardStats>("dashboard_stats", { todayStart, weekStart }),
  statusInfo: () => invoke<StatusInfo>("status_info"),
  storageStats: () => invoke<StorageStats>("storage_stats"),
  cleanupPreview: (olderThanDays: number, includeFavorites: boolean) =>
    invoke<{ count: number; bytes: number }>("cleanup_preview", { olderThanDays, includeFavorites }),
  cleanupOld: (olderThanDays: number, includeFavorites: boolean) =>
    invoke<number>("cleanup_old", { olderThanDays, includeFavorites }),
  scanDuplicates: () => invoke<DuplicateReport>("scan_duplicates"),
  ignoreDuplicates: (ids: number[]) => invoke<void>("ignore_duplicates", { ids }),
  listTasks: () => invoke<TaskInfo[]>("list_tasks"),
  cancelTask: (id: number) => invoke<void>("cancel_task", { id }),
};
