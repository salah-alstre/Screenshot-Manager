import { create } from "zustand";
import type { Collection, ListQuery, Tag } from "@/types/models";

export type SettingsSection =
  | "general"
  | "capture"
  | "shortcuts"
  | "storage"
  | "ocr"
  | "appearance"
  | "language"
  | "privacy"
  | "notifications"
  | "advanced"
  | "about";

export type Route =
  | { page: "dashboard" }
  | { page: "library"; scope: "all" | "recent" | "favorites" | "uncategorized" }
  | { page: "collection"; id: number }
  | { page: "tag"; id: number }
  | { page: "search"; query: string }
  | { page: "collections" }
  | { page: "tags" }
  | { page: "ocr" }
  | { page: "trash" }
  | { page: "settings"; section?: SettingsSection }
  | { page: "storage" }
  | { page: "duplicates" };

export interface ViewerState {
  id: number;
  /** The list the screenshot was opened from, for next/previous navigation. */
  query: ListQuery | null;
  index: number;
  highlight?: string;
  tab?: "details" | "text" | "notes";
}

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
}

interface Dialogs {
  collection: { collection?: Collection; assignIds?: number[] } | null;
  tag: { tag?: Tag; assignIds?: number[] } | null;
  rename: { id: number; name: string } | null;
  export: { ids: number[]; collectionId?: number } | null;
  confirm: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
}

interface UiState {
  route: Route;
  navigate: (route: Route) => void;
  viewer: ViewerState | null;
  openViewer: (v: ViewerState) => void;
  updateViewer: (patch: Partial<ViewerState>) => void;
  closeViewer: () => void;
  editorId: number | null;
  openEditor: (id: number) => void;
  closeEditor: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  searchFocusTick: number;
  focusSearch: () => void;
  dialogs: Dialogs;
  openDialog: <K extends keyof Dialogs>(key: K, value: Dialogs[K]) => void;
  closeDialog: (key: keyof Dialogs) => void;
}

export const useUi = create<UiState>((set) => ({
  route: { page: "dashboard" },
  navigate: (route) => set({ route }),
  viewer: null,
  openViewer: (viewer) => set({ viewer }),
  updateViewer: (patch) => set((s) => (s.viewer ? { viewer: { ...s.viewer, ...patch } } : s)),
  closeViewer: () => set({ viewer: null }),
  editorId: null,
  openEditor: (id) => set({ editorId: id }),
  closeEditor: () => set({ editorId: null }),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  searchFocusTick: 0,
  focusSearch: () => set((s) => ({ searchFocusTick: s.searchFocusTick + 1 })),
  dialogs: { collection: null, tag: null, rename: null, export: null, confirm: null },
  openDialog: (key, value) => set((s) => ({ dialogs: { ...s.dialogs, [key]: value } })),
  closeDialog: (key) => set((s) => ({ dialogs: { ...s.dialogs, [key]: null } })),
}));

/** Promise-based confirmation dialog: `if (await confirm({...})) …` */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useUi.getState().openDialog("confirm", { ...options, resolve });
  });
}

export function routeKey(r: Route): string {
  switch (r.page) {
    case "library":
      return `library:${r.scope}`;
    case "collection":
    case "tag":
      return `${r.page}:${r.id}`;
    case "search":
      return `search:${r.query}`;
    default:
      return r.page;
  }
}
