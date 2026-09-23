import type { ReactNode } from "react";
import { Tabs as T } from "radix-ui";
import { cn } from "@/utils/cn";

export const Tabs = {
  Root: T.Root,
  Content: ({ value, children, className }: { value: string; children: ReactNode; className?: string }) => (
    <T.Content value={value} className={cn("min-h-0 outline-none", className)}>
      {children}
    </T.Content>
  ),
  List: ({ children, className }: { children: ReactNode; className?: string }) => (
    <T.List className={cn("flex items-center gap-1 border-b border-border px-3", className)}>{children}</T.List>
  ),
  Trigger: ({ value, children }: { value: string; children: ReactNode }) => (
    <T.Trigger
      value={value}
      className="relative -mb-px flex h-10 items-center gap-1.5 px-2.5 text-[0.8125rem] font-medium text-fg-muted transition-colors hover:text-fg data-[state=active]:text-fg after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-accent"
    >
      {children}
    </T.Trigger>
  ),
};
