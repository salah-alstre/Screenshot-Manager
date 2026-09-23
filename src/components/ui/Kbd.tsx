import { cn } from "@/utils/cn";
import { shortcutKeys } from "@/utils/keys";

/** Renders a shortcut like "Ctrl+Shift+1" as key caps. Always LTR, as on keyboards. */
export function Kbd({ keys, small, className }: { keys: string; small?: boolean; className?: string }) {
  const parts = shortcutKeys(keys);
  if (!parts.length) return null;
  return (
    <span dir="ltr" className={cn("inline-flex items-center gap-0.5", className)}>
      {parts.map((k, i) => (
        <kbd
          key={i}
          className={cn(
            "inline-flex min-w-[1.4em] items-center justify-center rounded border border-border-strong/70 bg-surface-2 font-sans font-medium text-fg-muted shadow-[0_1px_0_var(--border-strong)]",
            small ? "h-4 px-1 text-[0.625rem]" : "h-5 px-1.5 text-[0.6875rem]",
          )}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
