import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { setLanguage } from "@/i18n";
import { api } from "@/services/api";
import { errorMessage } from "@/services/errors";
import { invalidateLibrary } from "@/services/queryClient";
import { applyTaskEvent } from "@/features/tasks/useTasks";
import { toast } from "@/stores/toast";
import { useUi } from "@/stores/ui";
import type { ImportReport, Settings, TaskInfo } from "@/types/models";
import { isTypingTarget, matches } from "@/utils/keys";
import { SETTINGS_KEY } from "./useSettings";
import { useTauriEvent } from "./useTauriEvent";
import { useActions } from "./useActions";

/** Applies appearance and language settings to the document. */
export function useApplySettings(settings: Settings | undefined) {
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const theme = settings.theme === "system" ? (media.matches ? "dark" : "light") : settings.theme;
      root.dataset.theme = theme;
    };
    applyTheme();
    root.dataset.accent = settings.accent;
    root.dataset.motion = settings.animation;
    root.style.setProperty("--ui-scale", String(settings.uiScale));
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [settings]);

  useEffect(() => {
    if (settings?.language) void setLanguage(settings.language);
  }, [settings?.language]);
}

/** Backend events → cache invalidation, navigation and notifications. */
export function useBackendEvents() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const actions = useActions();

  useTauriEvent("library-changed", () => invalidateLibrary());
  useTauriEvent<number[]>("screenshots-updated", () => invalidateLibrary());
  useTauriEvent<Settings>("settings-changed", (e) => qc.setQueryData(SETTINGS_KEY, e.payload));
  useTauriEvent<TaskInfo>("task-progress", (e) => {
    applyTaskEvent(e.payload);
    if (e.payload.state !== "running") invalidateLibrary();
  });
  useTauriEvent<{ view: string; id: number | null }>("navigate", (e) => {
    const { view, id } = e.payload;
    const ui = useUi.getState();
    if (view === "settings") {
      ui.closeViewer();
      ui.closeEditor();
      ui.navigate({ page: "settings" });
    } else if (view === "viewer" && id !== null) {
      ui.openViewer({ id, query: null, index: 0 });
    } else if (view === "editor" && id !== null) {
      ui.openEditor(id);
    }
  });
  useTauriEvent<ImportReport>("import-finished", (e) => {
    actions.reportImport(e.payload);
    invalidateLibrary(true);
  });
  useTauriEvent<{ code: string; context: string }>("app-error", (e) => {
    toast.error(errorMessage(t, { code: e.payload.code, message: "" }));
  });
}

/** App-wide keyboard shortcuts (palette, search, capture). */
export function useGlobalKeys(settings: Settings) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const kb = settings.keybindings;
      const ui = useUi.getState();
      if (matches(e, kb.commandPalette)) {
        e.preventDefault();
        ui.setPaletteOpen(!ui.paletteOpen);
        return;
      }
      if (ui.editorId !== null || ui.paletteOpen) return;
      if (matches(e, kb.search)) {
        e.preventDefault();
        ui.closeViewer();
        ui.focusSearch();
        return;
      }
      if (!isTypingTarget(e.target) && matches(e, kb.capture)) {
        e.preventDefault();
        void api.startCapture("region");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings.keybindings]);
}
