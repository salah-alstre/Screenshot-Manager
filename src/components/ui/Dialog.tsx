import type { ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/utils/cn";
import { IconButton } from "./IconButton";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = "md",
  icon,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
  icon?: ReactNode;
}) {
  const { t } = useTranslation();
  const widths = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl", xl: "max-w-5xl" };
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] animate-fade-in bg-[var(--overlay)]" />
        <D.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            "fixed top-1/2 left-1/2 z-[61] flex max-h-[85vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 animate-scale-in flex-col rounded-2xl border border-border bg-surface shadow-pop",
            widths[width],
          )}
        >
          <div className="flex items-start gap-3 px-5 pt-5 pb-3">
            {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
            <div className="min-w-0 flex-1">
              <D.Title className="text-[0.9375rem] font-semibold text-fg">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-[0.8125rem] leading-relaxed text-fg-muted">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{typeof title === "string" ? title : ""}</D.Description>
              )}
            </div>
            <D.Close asChild>
              <IconButton label={t("common.close")} size="sm" className="-me-1.5 -mt-1">
                <X className="size-4" />
              </IconButton>
            </D.Close>
          </div>
          {children ? <div className="min-h-0 overflow-y-auto px-5 pb-4">{children}</div> : null}
          {footer ? (
            <div className="flex items-center justify-end gap-2 rounded-b-2xl border-t border-border bg-surface-2/50 px-5 py-3">
              {footer}
            </div>
          ) : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
