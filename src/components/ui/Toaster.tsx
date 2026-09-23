import { useEffect } from "react";
import { CheckCircle2, Info, XCircle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToasts, type Toast } from "@/stores/toast";

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  const { t } = useTranslation();
  useEffect(() => {
    const id = setTimeout(() => dismiss(toast.id), toast.action ? toast.duration + 2000 : toast.duration);
    return () => clearTimeout(id);
  }, [toast, dismiss]);
  const Icon = toast.kind === "success" ? CheckCircle2 : toast.kind === "error" ? XCircle : Info;
  const color = toast.kind === "success" ? "text-success" : toast.kind === "error" ? "text-danger" : "text-accent";
  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className="glass pointer-events-auto flex w-[22rem] animate-slide-up items-center gap-3 rounded-xl border border-border py-2.5 ps-3.5 pe-2 shadow-pop"
    >
      <Icon className={`size-[1.125rem] shrink-0 ${color}`} />
      <p className="min-w-0 flex-1 text-[0.8125rem] text-fg">{toast.message}</p>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action!.run();
            dismiss(toast.id);
          }}
          className="shrink-0 rounded-md px-2 py-1 text-[0.8125rem] font-semibold text-accent hover:bg-accent-soft"
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        aria-label={t("common.dismiss")}
        onClick={() => dismiss(toast.id)}
        className="shrink-0 rounded-md p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed end-4 bottom-4 z-[120] flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
