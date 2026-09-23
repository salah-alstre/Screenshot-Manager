import { Popover } from "radix-ui";
import { useTranslation } from "react-i18next";
import { CheckCircle2, CircleSlash, Loader2, XCircle } from "lucide-react";
import { api } from "@/services/api";
import { ProgressBar } from "@/components/ui/feedback";
import { useTasks } from "./useTasks";
import { formatNumber } from "@/utils/format";

/** Top-bar indicator for background work (OCR, imports, exports, scans). */
export function TaskIndicator() {
  const { t, i18n } = useTranslation();
  const { all, running } = useTasks();
  if (!all.length) return null;
  const main = running[0] ?? all[all.length - 1]!;
  const progress = main.total ? main.done / main.total : 0;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="no-drag flex h-8 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-xs text-fg-muted shadow-soft transition-colors hover:text-fg"
          aria-label={t("tasks.title")}
        >
          {running.length ? <Loader2 className="size-3.5 animate-spin text-accent" /> : <CheckCircle2 className="size-3.5 text-success" />}
          <span className="max-w-40 truncate">{t(`tasks.kinds.${main.kind}`)}</span>
          {main.total > 1 ? (
            <span className="tabular-nums text-fg-subtle">{Math.round(progress * 100)}%</span>
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="glass z-[90] w-80 animate-scale-in rounded-xl border border-border p-3 shadow-pop"
        >
          <p className="mb-2 text-xs font-semibold text-fg">{t("tasks.title")}</p>
          <div className="flex flex-col gap-3">
            {all.map((task) => (
              <div key={task.id} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[0.8125rem]">
                  {task.state === "running" ? (
                    <Loader2 className="size-3.5 animate-spin text-accent" />
                  ) : task.state === "done" ? (
                    <CheckCircle2 className="size-3.5 text-success" />
                  ) : task.state === "cancelled" ? (
                    <CircleSlash className="size-3.5 text-fg-subtle" />
                  ) : (
                    <XCircle className="size-3.5 text-danger" />
                  )}
                  <span className="flex-1 truncate text-fg">{t(`tasks.kinds.${task.kind}`)}</span>
                  <span className="text-xs text-fg-subtle tabular-nums">
                    {t("tasks.progress", { done: formatNumber(task.done, i18n.language), total: formatNumber(task.total, i18n.language) })}
                  </span>
                  {task.state === "running" && task.cancellable ? (
                    <button
                      type="button"
                      onClick={() => void api.cancelTask(task.id)}
                      className="rounded px-1.5 py-0.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-danger"
                    >
                      {t("tasks.cancel")}
                    </button>
                  ) : null}
                </div>
                <ProgressBar value={task.total ? task.done / task.total : 0} />
              </div>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
