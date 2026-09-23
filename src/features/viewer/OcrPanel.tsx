import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Copy, Highlighter, Loader2, PencilLine, RefreshCw, ScanText, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Textarea } from "@/components/ui/controls";
import { useActions } from "@/hooks/useActions";
import { useSettings } from "@/hooks/useSettings";
import { api } from "@/services/api";
import { errorMessage } from "@/services/errors";
import { invalidateLibrary } from "@/services/queryClient";
import { toast } from "@/stores/toast";
import { confirm, useUi } from "@/stores/ui";
import type { ScreenshotDetail } from "@/types/models";
import { cn } from "@/utils/cn";
import { findMatches, highlightTerms, segment } from "@/utils/normalize";

export function OcrPanel({
  shot,
  find,
  onFindChange,
  showOnImage,
  onShowOnImage,
}: {
  shot: ScreenshotDetail;
  find: string;
  onFindChange: (v: string) => void;
  showOnImage: boolean;
  onShowOnImage: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const settings = useSettings();
  const actions = useActions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [current, setCurrent] = useState(0);
  const textRef = useRef<HTMLDivElement>(null);
  const text = shot.ocr?.text ?? "";

  useEffect(() => {
    setEditing(false);
    setCurrent(0);
  }, [shot.id]);

  const terms = useMemo(() => highlightTerms(find), [find]);
  const ranges = useMemo(() => findMatches(text, terms), [text, terms]);
  const segments = useMemo(() => segment(text, ranges), [text, ranges]);

  useEffect(() => setCurrent(0), [find]);
  useEffect(() => {
    textRef.current?.querySelector(`[data-hit="${current}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [current, ranges.length]);

  const rerun = async () => {
    if (shot.ocr?.edited) {
      const ok = await confirm({ title: t("viewer.ocr.rerunConfirmTitle"), description: t("viewer.ocr.rerunConfirmDesc"), confirmLabel: t("viewer.ocr.rerun") });
      if (!ok) return;
    }
    await actions.runOcr([shot.id]);
  };

  const save = async () => {
    try {
      await api.updateOcrText(shot.id, draft);
      invalidateLibrary(true);
      setEditing(false);
      toast.success(t("viewer.ocr.saved"));
    } catch (e) {
      toast.error(errorMessage(t, e));
    }
  };

  if (!settings.ocrEnabled && shot.ocrStatus !== "done") {
    return (
      <Placeholder icon={<ScanText />} text={t("viewer.ocr.disabled")}>
        <Button size="sm" onClick={() => useUi.getState().navigate({ page: "settings", section: "ocr" })}>
          {t("settings.sections.ocr")}
        </Button>
      </Placeholder>
    );
  }
  if (shot.ocrStatus === "pending") {
    return <Placeholder icon={<Loader2 className="animate-spin" />} text={t("viewer.ocr.running")} />;
  }
  if (shot.ocrStatus === "none" || (shot.ocrStatus === "failed" && !text)) {
    return (
      <Placeholder icon={<ScanText />} text={shot.ocrStatus === "failed" ? t("viewer.ocr.failed") : t("viewer.ocr.notRun")}>
        <Button variant="primary" size="sm" icon={<ScanText className="size-3.5" />} onClick={() => void actions.runOcr([shot.id])}>
          {shot.ocrStatus === "failed" ? t("common.retry") : t("viewer.ocr.run")}
        </Button>
      </Placeholder>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border p-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
          <input
            value={find}
            onChange={(e) => onFindChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ranges.length) setCurrent((c) => (e.shiftKey ? (c - 1 + ranges.length) % ranges.length : (c + 1) % ranges.length));
            }}
            placeholder={t("viewer.ocr.search")}
            aria-label={t("viewer.ocr.search")}
            className="h-8 w-full rounded-lg bg-surface-2 ps-8 pe-2 text-[0.8125rem] text-fg placeholder:text-fg-subtle focus:shadow-[0_0_0_2px_var(--accent-ring)]"
          />
        </div>
        <IconButton size="sm" label={t("viewer.previous")} disabled={!ranges.length} onClick={() => setCurrent((c) => (c - 1 + ranges.length) % ranges.length)}>
          <ChevronUp className="size-4" />
        </IconButton>
        <IconButton size="sm" label={t("viewer.next")} disabled={!ranges.length} onClick={() => setCurrent((c) => (c + 1) % ranges.length)}>
          <ChevronDown className="size-4" />
        </IconButton>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 text-xs text-fg-subtle">
        <span className="truncate">
          {find.trim() ? (ranges.length ? `${t("viewer.ocr.matches", { count: ranges.length })} · ${current + 1}/${ranges.length}` : t("viewer.ocr.noMatches")) : null}
          {!find.trim() && shot.ocr ? (
            <>
              {t("viewer.ocr.language", { lang: shot.ocr.language })}
              {shot.ocr.edited ? ` · ${t("viewer.ocr.edited")}` : ""}
            </>
          ) : null}
        </span>
        <div className="flex items-center gap-0.5">
          <IconButton size="sm" label={t("viewer.ocr.highlight")} active={showOnImage} onClick={() => onShowOnImage(!showOnImage)}>
            <Highlighter className="size-3.5" />
          </IconButton>
          <IconButton
            size="sm"
            label={t("viewer.ocr.copy")}
            disabled={!text}
            onClick={() => void api.copyText(text).then(() => toast.success(t("viewer.ocr.copied")))}
          >
            <Copy className="size-3.5" />
          </IconButton>
          <IconButton
            size="sm"
            label={t("viewer.ocr.edit")}
            active={editing}
            onClick={() => {
              setDraft(text);
              setEditing((v) => !v);
            }}
          >
            <PencilLine className="size-3.5" />
          </IconButton>
          <IconButton size="sm" label={t("viewer.ocr.rerun")} onClick={() => void rerun()}>
            <RefreshCw className="size-3.5" />
          </IconButton>
        </div>
      </div>
      {editing ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
          <Textarea autoFocus dir="auto" value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-0 flex-1 resize-none font-mono text-xs" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" variant="primary" onClick={() => void save()}>
              {t("viewer.ocr.save")}
            </Button>
          </div>
        </div>
      ) : text ? (
        <div ref={textRef} dir="auto" className="selectable min-h-0 flex-1 overflow-y-auto px-4 pb-4 text-[0.8125rem] leading-relaxed whitespace-pre-wrap text-fg">
          {segments.map((s, i) =>
            s.hit ? (
              <mark key={i} data-hit={s.index} className={cn("hl", s.index === current && "current")}>
                {s.text}
              </mark>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )}
        </div>
      ) : (
        <Placeholder icon={<ScanText />} text={t("viewer.ocr.empty")} />
      )}
    </div>
  );
}

function Placeholder({ icon, text, children }: { icon: React.ReactNode; text: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl bg-surface-2 text-fg-muted [&>svg]:size-5">{icon}</div>
      <p className="max-w-60 text-[0.8125rem] text-fg-muted">{text}</p>
      {children}
    </div>
  );
}
