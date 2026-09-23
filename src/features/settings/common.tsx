import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export function SettingsGroup({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      {title ? <h2 className="mb-1 px-1 text-[0.8125rem] font-semibold text-fg">{title}</h2> : null}
      {description ? <p className="mb-3 px-1 text-xs leading-relaxed text-fg-muted">{description}</p> : null}
      <div className={cn("divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft", !title && !description && "")}>{children}</div>
    </section>
  );
}

export function SettingRow({
  label,
  description,
  children,
  stacked,
}: {
  label: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  stacked?: boolean;
}) {
  return (
    <div className={cn("flex gap-4 px-4 py-3.5", stacked ? "flex-col" : "items-center justify-between")}>
      <div className="min-w-0 flex-1">
        <div className="text-[0.8125rem] font-medium text-fg">{label}</div>
        {description ? <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">{description}</div> : null}
      </div>
      {children ? <div className={cn("shrink-0", stacked && "w-full")}>{children}</div> : null}
    </div>
  );
}

export function ChoiceCard({
  selected,
  onClick,
  title,
  description,
  icon,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3 text-start transition-all",
        selected ? "border-accent bg-accent-soft shadow-[0_0_0_1px_var(--accent)]" : "border-border bg-surface hover:border-border-strong",
      )}
    >
      {children}
      <div className="flex items-start gap-2.5">
        {icon ? <span className={cn("mt-0.5 [&>svg]:size-4", selected ? "text-accent" : "text-fg-muted")}>{icon}</span> : null}
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-medium text-fg">{title}</p>
          {description ? <p className="mt-0.5 text-xs text-fg-muted">{description}</p> : null}
        </div>
      </div>
    </button>
  );
}
