// Empty states, skeletons, progress and small display components.
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { colorHex, softBg } from "@/utils/colors";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      <div className="relative mb-5">
        <div className="absolute inset-0 scale-150 rounded-full bg-accent-soft blur-2xl" />
        <div className="relative flex size-16 items-center justify-center rounded-2xl border border-border bg-surface text-accent shadow-card [&>svg]:size-7">
          {icon}
        </div>
      </div>
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-[0.8125rem] leading-relaxed text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-5 flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}

export function TagChip({
  name,
  color,
  onRemove,
  removeLabel,
  size = "md",
  onClick,
  count,
}: {
  name: string;
  color: string;
  count?: string;
  onRemove?: () => void;
  removeLabel?: string;
  size?: "sm" | "md";
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full font-medium whitespace-nowrap",
        size === "sm" ? "h-5 px-1.5 text-[0.6875rem]" : "h-6 px-2 text-xs",
        onClick && "transition-opacity hover:opacity-80",
      )}
      style={{ background: softBg(color), color: colorHex(color) }}
    >
      {/* dir="auto": direction follows the tag name, so #design stays LTR and Arabic tags read RTL. */}
      <span dir="auto" className="truncate">
        #{name}
      </span>
      {count !== undefined ? <span className="opacity-70">· {count}</span> : null}
      {onRemove ? (
        <span
          role="button"
          tabIndex={0}
          aria-label={removeLabel}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onRemove();
          }}
          className="-me-0.5 inline-flex size-3.5 items-center justify-center rounded-full hover:bg-black/10"
        >
          ×
        </span>
      ) : null}
    </Comp>
  );
}

export function ColorSwatches({
  colors,
  value,
  onChange,
  label,
}: {
  colors: string[];
  value: string;
  onChange: (c: string) => void;
  label: (c: string) => string;
}) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={label(c)}
          title={label(c)}
          onClick={() => onChange(c)}
          className={cn(
            "size-6 rounded-full transition-transform hover:scale-110",
            value === c && "ring-2 ring-offset-2 ring-offset-surface",
          )}
          style={{ background: colorHex(c), ...(value === c ? { ["--tw-ring-color" as string]: colorHex(c) } : {}) }}
        />
      ))}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[0.8125rem] font-semibold text-fg">{children}</h2>
      {action}
    </div>
  );
}
