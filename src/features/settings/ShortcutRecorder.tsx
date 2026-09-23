import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Kbd } from "@/components/ui/Kbd";
import { api } from "@/services/api";
import { cn } from "@/utils/cn";
import { eventToShortcut, hasModifier, normalizeShortcut } from "@/utils/keys";

/**
 * Click to record a key combination. Global shortcuts require a modifier and
 * are suspended system-wide while recording.
 */
export function ShortcutRecorder({
  value,
  onChange,
  global,
  validate,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  global?: boolean;
  validate?: (v: string) => string | null;
  label: string;
}) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    if (global) void api.setHotkeysSuspended(true);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setRecording(false);
        return;
      }
      const combo = eventToShortcut(e);
      if (!combo) return; // modifier only — keep waiting
      const normalized = normalizeShortcut(combo);
      if (global && !hasModifier(normalized) && !/^F\d+$|^PrintScreen$/.test(normalized)) {
        setError(t("settings.shortcuts.needsModifier"));
        return;
      }
      const problem = validate?.(normalized) ?? null;
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      setRecording(false);
      onChange(normalized);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (global) void api.setHotkeysSuspended(false);
    };
  }, [recording, global, onChange, validate, t]);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={label}
          onClick={() => {
            setError(null);
            setRecording((r) => !r);
          }}
          onBlur={() => setRecording(false)}
          className={cn(
            "flex h-8.5 min-w-36 items-center justify-center gap-2 rounded-lg border px-3 text-[0.8125rem] transition-all",
            recording ? "border-accent bg-accent-soft text-accent shadow-[0_0_0_3px_var(--accent-soft)]" : "border-border bg-surface shadow-soft hover:border-border-strong",
          )}
        >
          {recording ? (
            <span className="animate-pulse">{t("settings.shortcuts.record")}</span>
          ) : value ? (
            <Kbd keys={value} />
          ) : (
            <span className="text-fg-subtle">{t("settings.shortcuts.notSet")}</span>
          )}
        </button>
        {value && !recording ? (
          <button
            type="button"
            aria-label={t("settings.shortcuts.clear")}
            title={t("settings.shortcuts.clear")}
            onClick={() => onChange("")}
            className="flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <span className="size-7" />
        )}
      </div>
      {error ? <p className="max-w-64 text-end text-xs text-danger">{error}</p> : null}
    </div>
  );
}
