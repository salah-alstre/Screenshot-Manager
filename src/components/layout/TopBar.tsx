import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { CaptureButton } from "@/features/capture/CaptureButton";
import { TaskIndicator } from "@/features/tasks/TaskIndicator";
import { Kbd } from "@/components/ui/Kbd";
import { useSettings } from "@/hooks/useSettings";
import { useUi } from "@/stores/ui";
import { WindowControls } from "./WindowControls";

/** Draggable title bar with global search, task status, capture and window controls. */
export function TopBar() {
  const { t } = useTranslation();
  const settings = useSettings();
  const route = useUi((s) => s.route);
  const navigate = useUi((s) => s.navigate);
  const tick = useUi((s) => s.searchFocusTick);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(route.page === "search" ? route.query : "");

  useEffect(() => {
    if (tick) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [tick]);

  useEffect(() => {
    if (route.page !== "search") setValue("");
  }, [route.page]);

  // Live search: typing navigates to results after a short pause.
  useEffect(() => {
    const q = value.trim();
    const id = setTimeout(() => {
      if (q && !(route.page === "search" && route.query === q)) navigate({ page: "search", query: q });
    }, 220);
    return () => clearTimeout(id);
  }, [value, navigate, route]);

  return (
    <header className="drag-region flex h-12 shrink-0 items-center gap-3 border-b border-border bg-bg ps-4">
      <div className="no-drag relative w-full max-w-md">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setValue("");
              inputRef.current?.blur();
              if (route.page === "search") navigate({ page: "library", scope: "all" });
            }
            if (e.key === "Enter" && value.trim()) navigate({ page: "search", query: value.trim() });
          }}
          placeholder={t("titlebar.searchPlaceholder")}
          aria-label={t("common.search")}
          className="h-8 w-full rounded-lg border border-transparent bg-surface-2 ps-9 pe-20 text-[0.8125rem] text-fg transition-[border,background,box-shadow] placeholder:text-fg-subtle hover:border-border focus:border-accent focus:bg-surface focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        />
        <div className="absolute end-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {value ? (
            <button
              type="button"
              aria-label={t("common.clear")}
              onClick={() => {
                setValue("");
                if (route.page === "search") navigate({ page: "library", scope: "all" });
              }}
              className="rounded p-1 text-fg-subtle hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <Kbd keys={settings.keybindings.search} small />
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-label={t("titlebar.commandPalette")}
        title={t("titlebar.commandPalette")}
        className="no-drag hidden h-8 items-center gap-2 rounded-lg px-2 text-xs text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg lg:flex"
      >
        <Kbd keys={settings.keybindings.commandPalette} small />
      </button>
      <div className="flex-1" />
      <TaskIndicator />
      <CaptureButton />
      <WindowControls className="ms-1 h-12" />
    </header>
  );
}
