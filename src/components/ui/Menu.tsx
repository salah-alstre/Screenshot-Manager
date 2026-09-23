// Shared styling for dropdown and context menus (Radix primitives).
import type { ReactNode } from "react";
import { ContextMenu as CM, DropdownMenu as DM } from "radix-ui";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";
import { Kbd } from "./Kbd";

const contentCls =
  "glass z-[80] min-w-52 max-h-[70vh] overflow-y-auto animate-scale-in rounded-xl border border-border p-1 text-[0.8125rem] shadow-pop";
const itemCls =
  "relative flex h-8 cursor-default items-center gap-2.5 rounded-md px-2 text-fg outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent-soft data-[highlighted]:text-fg [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-fg-muted";
const dangerCls = "text-danger data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger [&>svg]:text-danger";

interface ItemProps {
  icon?: ReactNode;
  children: ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

function ItemBody({ icon, children, shortcut }: Pick<ItemProps, "icon" | "children" | "shortcut">) {
  return (
    <>
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? <Kbd keys={shortcut} small className="ms-4 opacity-70" /> : null}
    </>
  );
}

export const Dropdown = {
  Root: DM.Root,
  Trigger: DM.Trigger,
  Content: ({ children, align = "end", className }: { children: ReactNode; align?: "start" | "end" | "center"; className?: string }) => (
    <DM.Portal>
      <DM.Content align={align} sideOffset={6} collisionPadding={8} className={cn(contentCls, className)}>
        {children}
      </DM.Content>
    </DM.Portal>
  ),
  Item: ({ icon, children, shortcut, danger, disabled, onSelect }: ItemProps) => (
    <DM.Item disabled={disabled} onSelect={onSelect} className={cn(itemCls, danger && dangerCls)}>
      <ItemBody icon={icon} shortcut={shortcut}>
        {children}
      </ItemBody>
    </DM.Item>
  ),
  Check: ({ checked, children, onSelect, icon }: { checked: boolean; children: ReactNode; onSelect: () => void; icon?: ReactNode }) => (
    <DM.CheckboxItem
      checked={checked}
      onSelect={(e) => {
        e.preventDefault();
        onSelect();
      }}
      className={itemCls}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      <DM.ItemIndicator>
        <Check className="size-4 text-accent" />
      </DM.ItemIndicator>
    </DM.CheckboxItem>
  ),
  Radio: ({ checked, children, onSelect, icon, description }: { checked: boolean; children: ReactNode; onSelect: () => void; icon?: ReactNode; description?: string }) => (
    <DM.Item onSelect={onSelect} className={cn(itemCls, description && "h-auto py-1.5")}>
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{children}</span>
        {description ? <span className="truncate text-xs text-fg-subtle">{description}</span> : null}
      </span>
      {checked ? <Check className="size-4 text-accent" /> : <span className="size-4" />}
    </DM.Item>
  ),
  Separator: () => <DM.Separator className="-mx-1 my-1 h-px bg-border" />,
  Label: ({ children }: { children: ReactNode }) => (
    <DM.Label className="px-2 pt-1.5 pb-1 text-[0.6875rem] font-medium tracking-wide text-fg-subtle uppercase">{children}</DM.Label>
  ),
  Sub: ({ label, icon, children }: { label: ReactNode; icon?: ReactNode; children: ReactNode }) => (
    <DM.Sub>
      <DM.SubTrigger className={cn(itemCls, "data-[state=open]:bg-accent-soft")}>
        {icon}
        <span className="flex-1 truncate">{label}</span>
        <ChevronRight className="flip-rtl size-4" />
      </DM.SubTrigger>
      <DM.Portal>
        <DM.SubContent sideOffset={4} collisionPadding={8} className={contentCls}>
          {children}
        </DM.SubContent>
      </DM.Portal>
    </DM.Sub>
  ),
};

export const Context = {
  Root: CM.Root,
  Trigger: CM.Trigger,
  Content: ({ children }: { children: ReactNode }) => (
    <CM.Portal>
      <CM.Content collisionPadding={8} className={contentCls}>
        {children}
      </CM.Content>
    </CM.Portal>
  ),
  Item: ({ icon, children, shortcut, danger, disabled, onSelect }: ItemProps) => (
    <CM.Item disabled={disabled} onSelect={onSelect} className={cn(itemCls, danger && dangerCls)}>
      <ItemBody icon={icon} shortcut={shortcut}>
        {children}
      </ItemBody>
    </CM.Item>
  ),
  Separator: () => <CM.Separator className="-mx-1 my-1 h-px bg-border" />,
  Label: ({ children }: { children: ReactNode }) => (
    <CM.Label className="px-2 pt-1.5 pb-1 text-[0.6875rem] font-medium tracking-wide text-fg-subtle uppercase">{children}</CM.Label>
  ),
  Sub: ({ label, icon, children }: { label: ReactNode; icon?: ReactNode; children: ReactNode }) => (
    <CM.Sub>
      <CM.SubTrigger className={cn(itemCls, "data-[state=open]:bg-accent-soft")}>
        {icon}
        <span className="flex-1 truncate">{label}</span>
        <ChevronRight className="flip-rtl size-4" />
      </CM.SubTrigger>
      <CM.Portal>
        <CM.SubContent sideOffset={4} collisionPadding={8} className={contentCls}>
          {children}
        </CM.SubContent>
      </CM.Portal>
    </CM.Sub>
  ),
};
