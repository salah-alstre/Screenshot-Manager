// Types mirroring the Rust DTOs in src-tauri/src/db/models.rs (camelCase JSON).

export type OcrStatus = "none" | "pending" | "done" | "empty" | "failed";

export interface ScreenshotSummary {
  id: number;
  name: string;
  format: string;
  width: number;
  height: number;
  fileSize: number;
  capturedAt: number;
  importedAt: number;
  updatedAt: number;
  isFavorite: boolean;
  collectionId: number | null;
  ocrStatus: OcrStatus;
  hasNote: boolean;
  hasEdit: boolean;
  missing: boolean;
  trashedAt: number | null;
  tagIds: number[];
  /** Changes only when the image pixels change; used for cache busting. */
  imageVersion: number;
}

export interface OcrWord {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrInfo {
  text: string;
  language: string;
  engine: string;
  edited: boolean;
  updatedAt: number;
  words: OcrWord[];
}

export interface ScreenshotDetail extends ScreenshotSummary {
  filePath: string;
  editedPath: string | null;
  fileExists: boolean;
  sha256: string;
  source: "capture" | "import" | "watch" | "drop" | "edit" | string;
  captureMode: string | null;
  sourceMonitor: string | null;
  fileCreatedAt: number | null;
  fileModifiedAt: number | null;
  note: string;
  ocr: OcrInfo | null;
}

export interface OcrHit extends ScreenshotSummary {
  ocrText: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
}

export type NamedColor = "blue" | "violet" | "pink" | "red" | "orange" | "amber" | "green" | "teal" | "cyan" | "slate";

export interface Collection {
  id: number;
  name: string;
  icon: string;
  color: NamedColor;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  count: number;
  totalSize: number;
  coverIds: number[];
  lastAddedAt: number | null;
}

export interface Tag {
  id: number;
  name: string;
  color: NamedColor;
  createdAt: number;
  count: number;
}

export interface WatchedFolder {
  id: number;
  path: string;
  enabled: boolean;
  available: boolean;
  createdAt: number;
}

export type Scope = "all" | "recent" | "favorites" | "trash" | "collection" | "tag" | "uncategorized";
export type SortKey = "newest" | "oldest" | "largest" | "smallest" | "name" | "added";

export interface ListQuery {
  scope: Scope;
  collectionId?: number;
  tagId?: number;
  search?: string;
  dateFrom?: number;
  dateTo?: number;
  favoritesOnly?: boolean;
  ocr?: "with" | "without";
  largeOnly?: boolean;
  collectionIds?: number[];
  tagIds?: number[];
  minWidth?: number;
  minHeight?: number;
  sort?: SortKey;
  recentSince?: number;
  offset?: number;
  limit?: number;
}

export interface GlobalHotkeys {
  region: string;
  window: string;
  fullscreen: string;
  openApp: string;
}

export interface Keybindings {
  commandPalette: string;
  search: string;
  favorite: string;
  edit: string;
  copy: string;
  delete: string;
  open: string;
  capture: string;
}

export interface Settings {
  language: "en" | "ar";
  onboardingCompleted: boolean;
  launchAtStartup: boolean;
  closeToTray: boolean;
  trayHintShown: boolean;
  theme: "system" | "light" | "dark" | "oled";
  accent: "blue" | "violet" | "teal" | "amber" | "rose" | "green";
  uiScale: number;
  thumbnailSize: number;
  animation: "full" | "reduced" | "off";
  sidebarStyle: "expanded" | "compact";
  libraryView: "grid" | "large" | "compact" | "list";
  librarySort: SortKey;
  libraryRoot: string;
  captureAction: "save" | "copy" | "saveCopy" | "editor";
  showCapturePopup: boolean;
  captureCursor: boolean;
  captureDelay: number;
  fullscreenTarget: "cursor" | "primary" | "all";
  imageFormat: "png" | "jpg" | "webp";
  imageQuality: number;
  hotkeys: GlobalHotkeys;
  keybindings: Keybindings;
  ocrEnabled: boolean;
  autoOcr: boolean;
  ocrLanguage: "auto" | "en" | "ar" | "ar+en";
  trashAutoDeleteDays: 0 | 7 | 30 | 60 | 90;
  copyDroppedFiles: boolean;
  monitoringPaused: boolean;
  notifications: { capture: boolean; ocr: boolean; export: boolean; import: boolean };
  exportFormat: "png" | "jpg" | "webp";
  exportQuality: number;
}

export type SettingsPatch = { [K in keyof Settings]?: Settings[K] extends object ? Partial<Settings[K]> : Settings[K] };

export interface SettingsUpdate {
  settings: Settings;
  hotkeyErrors: string[];
}

export interface DashboardStats {
  total: number;
  today: number;
  week: number;
  favorites: number;
  storageBytes: number;
  ocrIndexed: number;
  ocrPending: number;
  trashCount: number;
  collectionsCount: number;
  recent: ScreenshotSummary[];
  topTags: Tag[];
  recentCollections: Collection[];
}

export interface StatusInfo {
  totalBytes: number;
  count: number;
  watchedFolders: number;
  monitoringPaused: boolean;
  ocrPending: number;
}

export interface Bucket {
  key: string;
  collectionId: number | null;
  bytes: number;
  count: number;
}

export interface StorageStats {
  totalBytes: number;
  count: number;
  trashBytes: number;
  trashCount: number;
  editedCount: number;
  largest: ScreenshotSummary[];
  oldest: ScreenshotSummary[];
  perCollection: Bucket[];
  perMonth: Bucket[];
}

export interface DuplicateGroup {
  key: string;
  kind: "exact" | "similar";
  items: ScreenshotSummary[];
}

export interface DuplicateReport {
  exact: DuplicateGroup[];
  similar: DuplicateGroup[];
}

export interface TaskInfo {
  id: number;
  kind: "ocr" | "import" | "export" | "duplicates" | "thumbnails" | "reindex" | "cleanup";
  done: number;
  total: number;
  state: "running" | "done" | "failed" | "cancelled";
  cancellable: boolean;
}

export interface ImportReport {
  imported: number;
  duplicates: number;
  failed: number;
  firstId: number | null;
}

export interface ExportResult {
  exported: number;
  failed: number;
  folder: string;
}

export interface MonitorInfo {
  index: number;
  device: string;
  name: string;
  rect: Rect;
  work: Rect;
  scale: number;
  primary: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WindowInfo {
  title: string;
  rect: Rect;
}

export interface AppInfo {
  version: string;
  tauriVersion: string;
  webviewVersion: string;
  schemaVersion: number;
  dataDir: string;
  logsDir: string;
  libraryRoot: string;
  defaultLibraryRoot: string;
  repositoryUrl: string | null;
  platform: string;
}

export interface OcrLanguages {
  installed: string[];
  arabic: boolean;
  english: boolean;
}

export type CaptureKind = "region" | "window" | "activeWindow" | "fullscreen" | "allMonitors" | "monitor" | "delayed";

export interface AppError {
  code: string;
  message: string;
}
