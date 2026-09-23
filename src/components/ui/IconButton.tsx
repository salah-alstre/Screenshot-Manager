import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/utils/cn";
import { Tooltip } from "./Tooltip";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  shortcut?: string;
  size?: "sm" | "md" | "lg";
  active?: boolean;
  tooltipSide?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
  noTooltip?: boolean;
}

const sizes = { sm: "size-7 rounded-md", md: "size-8 rounded-lg", lg: "size-10 rounded-xl" };

/** Icon-only button. Always has an accessible label and a tooltip. */
export function IconButton({
  label,
  shortcut,
  size = "md",
  active,
  className,
  children,
  tooltipSide,
  ref,
  noTooltip,
  ...rest
}: Props) {
  const btn = (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40",
        active && "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent",
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
  return (
    <Tooltip label={label} shortcut={shortcut} side={tooltipSide} disabled={noTooltip}>
      {btn}
    </Tooltip>
  );
}
