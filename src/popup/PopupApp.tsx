import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ClipboardCheck, Copy, ExternalLink, PencilLine, Trash2, X } from "lucide-react";
import { api } from "@/services/api";
import { thumbUrl } from "@/services/urls";
import { setLanguage } from "@/i18n";
import { cn } from "@/utils/cn";

interface PopupPayload {
  kind: "saved" | "copied" | "countdown";
  id: number | null;
  seconds: number | null;
  version: number | null;
}

const win = getCurrentWindow();
const AUTO_HIDE_MS = 5000;

export function PopupApp() {
  const { t } = useTranslation();
  const [payload, setPayload] = useState<PopupPayload | null>(null);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<"idle" | "copied" | "deleted">("idle");
  const [hover, setHover] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    setPayload(null);
    void win.hide();
  }, []);

  useEffect(() => {
    const un = listen<PopupPayload>("popup-show", async (e) => {
      try {
        const s = await api.getSettings();
        const dark = s.theme === "system" ? matchMedia("(prefers-color-scheme: dark)").matches : s.theme !== "light";
        document.documentElement.dataset.theme = dark ? (s.theme === "oled" ? "oled" : "dark") : "light";
        document.documentElement.dataset.accent = s.accent;
        await setLanguage(s.language);
      } catch {
        /* keep defaults */
      }
      setStatus("idle");
      setPayload(e.payload);
      setCount(e.payload.seconds ?? 0);
      await win.show();
    });
    return () => void un.then((f) => f());
  }, []);

  // Countdown ticks.
  useEffect(() => {
    if (payload?.kind !== "countdown" || count <= 0) return;
    const id = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [payload, count]);

  // Auto-hide (paused while hovered).
  useEffect(() => {
    if (!payload || payload.kind === "countdown" || hover) return;
    hideTimer.current = setTimeout(hide, status === "deleted" ? 1500 : AUTO_HIDE_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [payload, hover, status, hide]);

  const act = async (action: "copy" | "open" | "edit" | "delete") => {
    if (!payload?.id) return;
    try {
      await api.popupAction(action, payload.id);
      if (action === "copy") setStatus("copied");
      else if (action === "delete") setStatus("deleted");
      else setPayload(null);
    } catch {
      hide();
    }
  };

  if (!payload) return null;

  return (
    <div className="flex h-full w-full items-end p-2" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="glass flex w-full animate-slide-up items-center gap-3 rounded-2xl border border-border p-2.5 shadow-[0_10px_30px_-8px_rgb(0_0_0/0.45)]">
        {payload.kind === "countdown" ? (
          <div className="flex w-full items-center gap-3 px-1 py-1">
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-2xl font-bold text-accent-fg tabular-nums">{count}</span>
            <p className="text-[0.875rem] font-medium text-fg">{t("capture.countdown", { s: count })}</p>
          </div>
        ) : payload.kind === "copied" ? (
          <div className="flex w-full items-center gap-3 px-1 py-2">
            <span className="flex size-10 items-center justify-center rounded-xl bg-success/15 text-success">
              <ClipboardCheck className="size-5" />
            </span>
            <p className="flex-1 text-[0.875rem] font-medium text-fg">{t("popup.copied")}</p>
            <button type="button" aria-label={t("popup.close")} onClick={hide} className="rounded-md p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <>
            {payload.id ? (
              <button type="button" onClick={() => void act("open")} className="h-[4.5rem] w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2">
                <img src={thumbUrl(payload.id, payload.version ?? 0)} alt="" className="size-full object-cover object-top" />
              </button>
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className={cn("size-4 shrink-0", status === "deleted" ? "text-fg-subtle" : "text-success")} />
                <p className="flex-1 truncate text-[0.8125rem] font-semibold text-fg">
                  {status === "copied" ? t("popup.copied") : status === "deleted" ? t("popup.deleted") : t("popup.saved")}
                </p>
                <button type="button" aria-label={t("popup.close")} onClick={hide} className="rounded-md p-0.5 text-fg-subtle hover:bg-surface-2 hover:text-fg">
                  <X className="size-3.5" />
                </button>
              </div>
              {status !== "deleted" ? (
                <div className="flex items-center gap-1">
                  {(
                    [
                      ["copy", <Copy key="c" className="size-3.5" />, t("popup.copy")],
                      ["edit", <PencilLine key="e" className="size-3.5" />, t("popup.edit")],
                      ["open", <ExternalLink key="o" className="size-3.5" />, t("popup.open")],
                      ["delete", <Trash2 key="d" className="size-3.5" />, t("popup.delete")],
                    ] as const
                  ).map(([action, icon, label]) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => void act(action)}
                      className={cn(
                        "flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-surface-2 text-xs font-medium text-fg transition-colors hover:bg-surface-3",
                        action === "delete" && "hover:text-danger",
                      )}
                    >
                      {icon}
                      <span className="truncate">{label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
