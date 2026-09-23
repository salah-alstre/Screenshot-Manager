// Form controls: switch, slider, segmented control, select, input, textarea.
import type { InputHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from "react";
import { Select as S, Slider as Sl, Switch as Sw } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/utils/cn";

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Sw.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={label}
      className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-surface-3 transition-colors duration-200 data-[disabled]:opacity-50 data-[state=checked]:bg-accent"
    >
      <Sw.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-transform duration-200 data-[state=checked]:translate-x-[1.125rem] rtl:-translate-x-0.5 rtl:data-[state=checked]:-translate-x-[1.125rem]" />
    </Sw.Root>
  );
}

export function Slider({
  value,
  onChange,
  onCommit,
  min,
  max,
  step = 1,
  label,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  className?: string;
}) {
  return (
    <Sl.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onChange(v[0]!)}
      onValueCommit={(v) => onCommit?.(v[0]!)}
      className={cn("relative flex h-5 w-full touch-none items-center select-none", className)}
    >
      <Sl.Track className="relative h-1 grow overflow-hidden rounded-full bg-surface-3">
        <Sl.Range className="absolute h-full bg-accent" />
      </Sl.Track>
      <Sl.Thumb
        aria-label={label}
        className="block size-4 rounded-full border border-border-strong bg-white shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-accent"
      />
    </Sl.Root>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode; title?: string }[];
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cn("inline-flex rounded-lg border border-border bg-surface-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          aria-label={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-md font-medium text-fg-muted transition-all duration-150 hover:text-fg [&>svg]:size-4",
            size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-3 text-[0.8125rem]",
            value === o.value && "bg-surface text-fg shadow-soft",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <S.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <S.Trigger
        aria-label={label}
        className={cn(
          "inline-flex h-8.5 min-w-40 items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-[0.8125rem] text-fg shadow-soft transition-colors hover:border-border-strong",
          className,
        )}
      >
        <S.Value />
        <S.Icon>
          <ChevronDown className="size-4 text-fg-subtle" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={6} className="glass z-[90] min-w-[var(--radix-select-trigger-width)] animate-scale-in rounded-xl border border-border p-1 shadow-pop">
          <S.Viewport>
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="relative flex h-8 cursor-default items-center gap-2 rounded-md ps-7 pe-3 text-[0.8125rem] text-fg outline-none select-none data-[highlighted]:bg-accent-soft"
              >
                <S.ItemIndicator className="absolute start-2">
                  <Check className="size-3.5 text-accent" />
                </S.ItemIndicator>
                <S.ItemText>{o.label}</S.ItemText>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}

const fieldCls =
  "w-full rounded-lg border border-border bg-surface px-3 text-[0.8125rem] text-fg shadow-soft placeholder:text-fg-subtle transition-[border,box-shadow] hover:border-border-strong focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]";

export function Input({ className, ref, ...rest }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(fieldCls, "h-8.5", className)} {...rest} />;
}

export function Textarea({
  className,
  ref,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} className={cn(fieldCls, "py-2 leading-relaxed", className)} {...rest} />;
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      {children}
      {hint ? <span className="text-xs text-fg-subtle">{hint}</span> : null}
    </label>
  );
}
