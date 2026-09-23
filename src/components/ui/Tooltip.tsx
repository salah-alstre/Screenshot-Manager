import type { ReactNode } from "react";
import { Tooltip as T } from "radix-ui";
import { Kbd } from "./Kbd";

export const TooltipProvider = T.Provider;

export function Tooltip({
  label,
  shortcut,
  side = "bottom",
  children,
  disabled,
}: {
  label: ReactNode;
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
  disabled?: boolean;
}) {
  if (disabled) return <>{children}</>;
  return (
    <T.Root delayDuration={350}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-[100] flex max-w-72 animate-fade-in items-center gap-2 rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg shadow-card"
        >
          {label}
          {shortcut ? <Kbd keys={shortcut} small /> : null}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
