import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import { cn } from "@/utils/cn";

const win = getCurrentWindow();

/** Minimize / maximize / close for the frameless window (Windows 11 style). */
export function WindowControls({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void win.isMaximized().then(setMaximized);
    void win.onResized(() => void win.isMaximized().then(setMaximized)).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  const btn = "no-drag inline-flex h-full w-11 items-center justify-center text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg";
  return (
    // In RTL the order mirrors (close ends up leftmost), matching Arabic Windows.
    <div className={cn("flex h-10 items-stretch", className)}>
      <button type="button" aria-label={t("titlebar.minimize")} title={t("titlebar.minimize")} className={btn} onClick={() => void win.minimize()}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={maximized ? t("titlebar.restore") : t("titlebar.maximize")}
        title={maximized ? t("titlebar.restore") : t("titlebar.maximize")}
        className={btn}
        onClick={() => void win.toggleMaximize()}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M2.5 2.5V1h6.5v6.5H7.5" stroke="currentColor" />
            <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" />
          </svg>
        )}
      </button>
      <button
        type="button"
        aria-label={t("titlebar.close")}
        title={t("titlebar.close")}
        className={cn(btn, "hover:bg-[#e81123] hover:text-white")}
        onClick={() => void win.close()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  );
}
