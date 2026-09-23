import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/controls";
import { api } from "@/services/api";
import { errorMessage } from "@/services/errors";
import { invalidateLibrary } from "@/services/queryClient";
import { toast } from "@/stores/toast";
import type { ScreenshotDetail } from "@/types/models";

/** Autosaving notes for a screenshot. */
export function NotesPanel({ shot }: { shot: ScreenshotDetail }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(shot.note);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const saved = useRef(shot.note);
  const idRef = useRef(shot.id);

  // Reset only when switching screenshots, so background refreshes never clobber typing.
  useEffect(() => {
    idRef.current = shot.id;
    setValue(shot.note);
    saved.current = shot.note;
    setState("idle");
  }, [shot.id]); // intentionally not depending on shot.note

  useEffect(() => {
    if (value === saved.current) return;
    const id = shot.id;
    const handle = setTimeout(async () => {
      setState("saving");
      try {
        await api.saveNote(id, value);
        saved.current = value;
        if (idRef.current === id) setState("saved");
        invalidateLibrary();
      } catch (e) {
        setState("idle");
        toast.error(errorMessage(t, e));
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [value, shot.id, t]);

  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <Textarea
        dir="auto"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("viewer.notes.placeholder")}
        aria-label={t("viewer.tabs.notes")}
        className="min-h-48 flex-1 resize-none"
      />
      <div className="flex items-center justify-between text-xs text-fg-subtle">
        <span>{t("viewer.notes.hint")}</span>
        {state === "saving" ? (
          <span className="flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" />
            {t("viewer.notes.saving")}
          </span>
        ) : state === "saved" ? (
          <span className="flex items-center gap-1 text-success">
            <Check className="size-3" />
            {t("viewer.notes.saved")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
