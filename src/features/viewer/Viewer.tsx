import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Maximize,
  Minimize,
  MoreHorizontal,
  PanelRight,
  PencilLine,
  Scan,
  Star,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Dropdown } from "@/components/ui/Menu";
import { Tabs } from "@/components/ui/Tabs";
import { Skeleton } from "@/components/ui/feedback";
import { WindowControls } from "@/components/layout/WindowControls";
import { renderDropdownEntries, useScreenshotMenu } from "@/features/library/menuItems";
import { useActions } from "@/hooks/useActions";
import { useScreenshot } from "@/hooks/useData";
import { usePagedScreenshots } from "@/hooks/usePagedScreenshots";
import { useSettings } from "@/hooks/useSettings";
import { api } from "@/services/api";
import { errorMessage } from "@/services/errors";
import { invalidateLibrary } from "@/services/queryClient";
import { imageUrl } from "@/services/urls";
import { toast } from "@/stores/toast";
import { confirm, useUi, type ViewerState } from "@/stores/ui";
import type { ScreenshotDetail } from "@/types/models";
import { cn } from "@/utils/cn";
import { formatDateTime, formatNumber } from "@/utils/format";
import { isTypingTarget, matches } from "@/utils/keys";
import { highlightTerms, wordMatches } from "@/utils/normalize";
import { DetailsPanel } from "./DetailsPanel";
import { ImageStage, type StageHandle } from "./ImageStage";
import { NotesPanel } from "./NotesPanel";
import { OcrPanel } from "./OcrPanel";

const appWindow = getCurrentWindow();

function MoreMenu({ shot, viewer }: { shot: ScreenshotDetail; viewer: ViewerState }) {
  const entries = useScreenshotMenu(shot, [shot.id], { query: viewer.query, index: viewer.index, inTrash: shot.trashedAt !== null });
  return <>{renderDropdownEntries(entries.filter((e) => e.key !== "open"))}</>;
}

export function Viewer() {
  const viewer = useUi((s) => s.viewer);
  if (!viewer) return null;
  return <ViewerInner viewer={viewer} />;
}

function ViewerInner({ viewer }: { viewer: ViewerState }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const settings = useSettings();
  const actions = useActions();
  const close = useUi((s) => s.closeViewer);
  const updateViewer = useUi((s) => s.updateViewer);
  const { data: shot, isLoading, isError } = useScreenshot(viewer.id);
  const stage = useRef<StageHandle>(null);
  const [tab, setTab] = useState<string>(viewer.tab ?? "details");
  const [panel, setPanel] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [find, setFind] = useState(viewer.highlight ?? "");
  const [showOnImage, setShowOnImage] = useState(!!viewer.highlight);
  const [zoom, setZoom] = useState(1);

  // Neighbours come from the same paged list the viewer was opened from.
  const range = useMemo<[number, number]>(() => [Math.max(0, viewer.index - 1), viewer.index + 1], [viewer.index]);
  const list = usePagedScreenshots(viewer.query ?? { scope: "all" }, range);
  const hasList = viewer.query !== null;
  const prev = hasList && viewer.index > 0 ? list.getItem(viewer.index - 1) : undefined;
  const next = hasList ? list.getItem(viewer.index + 1) : undefined;

  const go = useCallback(
    (dir: 1 | -1) => {
      const target = dir === 1 ? next : prev;
      if (target) updateViewer({ id: target.id, index: viewer.index + dir });
    },
    [next, prev, updateViewer, viewer.index],
  );

  const setFs = useCallback(async (on: boolean) => {
    await appWindow.setFullscreen(on);
    setFullscreen(on);
  }, []);

  const exit = useCallback(() => {
    if (fullscreen) void setFs(false);
    close();
  }, [fullscreen, setFs, close]);

  const trash = useCallback(async () => {
    if (!shot) return;
    await actions.trash([shot.id]);
    if (next) updateViewer({ id: next.id });
    else if (prev) updateViewer({ id: prev.id, index: viewer.index - 1 });
    else exit();
  }, [shot, actions, next, prev, updateViewer, viewer.index, exit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUi.getState();
      if (ui.editorId !== null || ui.paletteOpen || Object.values(ui.dialogs).some(Boolean)) return;
      if (document.querySelector("[data-radix-popper-content-wrapper]")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (fullscreen) void setFs(false);
        else close();
        return;
      }
      if (isTypingTarget(e.target)) return;
      const rtl = document.documentElement.dir === "rtl";
      const kb = settings.keybindings;
      if (e.key === "ArrowRight") go(rtl ? -1 : 1);
      else if (e.key === "ArrowLeft") go(rtl ? 1 : -1);
      else if (e.key === "+" || e.key === "=") stage.current?.zoomIn();
      else if (e.key === "-") stage.current?.zoomOut();
      else if (e.key === "0") stage.current?.fit();
      else if (e.key === "1") stage.current?.actual();
      else if (!shot) return;
      else if (matches(e, kb.favorite)) void actions.setFavorite([shot.id], !shot.isFavorite);
      else if (matches(e, kb.edit) && shot.fileExists) actions.edit(shot.id);
      else if (matches(e, kb.copy) && !window.getSelection()?.toString()) void actions.copy(shot.id);
      else if (matches(e, kb.delete) && shot.trashedAt === null) void trash();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, shot, settings.keybindings, actions, fullscreen, setFs, close, trash]);

  const terms = useMemo(() => highlightTerms(find), [find]);
  const highlight = useMemo(
    () => (showOnImage && terms.length ? (w: { text: string }) => wordMatches(w.text, terms) : undefined),
    [showOnImage, terms],
  );

  const revert = async () => {
    if (!shot) return;
    const ok = await confirm({ title: t("viewer.revertTitle"), description: t("viewer.revertDesc"), confirmLabel: t("viewer.revert") });
    if (!ok) return;
    try {
      await api.revertEdit(shot.id);
      invalidateLibrary(true);
      toast.success(t("viewer.reverted"));
    } catch (e) {
      toast.error(errorMessage(t, e));
    }
  };

  const navBtn = "absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full glass border border-border text-fg shadow-pop transition-all hover:scale-105 disabled:opacity-0";

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-bg" role="dialog" aria-modal="true" aria-label={shot?.name ?? t("viewer.close")}>
      {!fullscreen ? (
        <header className="drag-region flex h-12 shrink-0 items-center gap-2 border-b border-border ps-3">
          <IconButton label={t("viewer.close")} shortcut="Esc" className="no-drag" onClick={exit}>
            <ArrowLeft className="flip-rtl size-4" />
          </IconButton>
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-[0.8125rem] font-semibold text-fg">{shot?.name ?? " "}</p>
            <p className="truncate text-[0.6875rem] text-fg-subtle">
              {shot ? formatDateTime(shot.capturedAt, lang) : " "}
              {hasList && list.total ? ` · ${t("viewer.position", { index: formatNumber(viewer.index + 1, lang), total: formatNumber(list.total, lang) })}` : ""}
            </p>
          </div>
          {shot ? (
            <div className="no-drag flex items-center gap-0.5">
              <div className="me-1 flex items-center gap-0.5 rounded-lg border border-border bg-surface px-0.5">
                <IconButton size="sm" label={t("viewer.zoomOut")} shortcut="-" onClick={() => stage.current?.zoomOut()}>
                  <ZoomOut className="size-4" />
                </IconButton>
                <button type="button" onClick={() => stage.current?.fit()} className="w-12 text-center text-xs text-fg-muted tabular-nums hover:text-fg" title={t("viewer.fit")}>
                  {Math.round(zoom * 100)}%
                </button>
                <IconButton size="sm" label={t("viewer.zoomIn")} shortcut="+" onClick={() => stage.current?.zoomIn()}>
                  <ZoomIn className="size-4" />
                </IconButton>
                <IconButton size="sm" label={t("viewer.actualSize")} shortcut="1" onClick={() => stage.current?.actual()}>
                  <Scan className="size-4" />
                </IconButton>
              </div>
              {shot.trashedAt === null ? (
                <>
                  <IconButton
                    label={shot.isFavorite ? t("common.unfavorite") : t("common.favorite")}
                    shortcut={settings.keybindings.favorite}
                    active={shot.isFavorite}
                    className={shot.isFavorite ? "text-fav hover:text-fav" : ""}
                    onClick={() => void actions.setFavorite([shot.id], !shot.isFavorite)}
                  >
                    <Star className="size-4" fill={shot.isFavorite ? "currentColor" : "none"} />
                  </IconButton>
                  <IconButton label={t("common.copy")} shortcut={settings.keybindings.copy} disabled={!shot.fileExists} onClick={() => void actions.copy(shot.id)}>
                    <Copy className="size-4" />
                  </IconButton>
                  <IconButton label={t("common.export")} disabled={!shot.fileExists} onClick={() => actions.exportMany([shot.id])}>
                    <Download className="size-4" />
                  </IconButton>
                  <IconButton label={t("common.moveToTrash")} shortcut={settings.keybindings.delete} className="hover:text-danger" onClick={() => void trash()}>
                    <Trash2 className="size-4" />
                  </IconButton>
                  {shot.hasEdit ? (
                    <IconButton label={t("viewer.revert")} onClick={() => void revert()}>
                      <Undo2 className="size-4" />
                    </IconButton>
                  ) : null}
                  <Dropdown.Root>
                    <Dropdown.Trigger asChild>
                      <button type="button" aria-label={t("common.more")} className="inline-flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg">
                        <MoreHorizontal className="size-4" />
                      </button>
                    </Dropdown.Trigger>
                    <Dropdown.Content>
                      <MoreMenu shot={shot} viewer={viewer} />
                    </Dropdown.Content>
                  </Dropdown.Root>
                  <Button
                    variant="primary"
                    size="md"
                    className="ms-1"
                    icon={<PencilLine className="size-4" />}
                    disabled={!shot.fileExists}
                    onClick={() => actions.edit(shot.id)}
                  >
                    {t("common.edit")}
                  </Button>
                </>
              ) : null}
              <div className="mx-1 h-5 w-px bg-border" />
              <IconButton label={fullscreen ? t("viewer.exitFullscreen") : t("viewer.fullscreen")} onClick={() => void setFs(!fullscreen)}>
                <Maximize className="size-4" />
              </IconButton>
              <IconButton label={t("viewer.togglePanel")} active={panel} onClick={() => setPanel((p) => !p)}>
                <PanelRight className="flip-rtl size-4" />
              </IconButton>
            </div>
          ) : null}
          <WindowControls className="h-12" />
        </header>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="group/stage relative min-w-0 flex-1 bg-canvas">
          {isLoading ? (
            <div className="flex size-full items-center justify-center p-12">
              <Skeleton className="aspect-video w-2/3 rounded-xl" />
            </div>
          ) : isError || !shot ? (
            <div className="flex size-full flex-col items-center justify-center gap-2 text-fg-muted">
              <AlertTriangle className="size-8" />
              <p>{t("errors.not_found")}</p>
            </div>
          ) : !shot.fileExists ? (
            <div className="flex size-full flex-col items-center justify-center gap-3 px-8 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-warning">
                <AlertTriangle className="size-6" />
              </div>
              <p className="text-base font-semibold text-fg">{t("viewer.missingTitle")}</p>
              <p className="max-w-sm text-[0.8125rem] text-fg-muted">{t("viewer.missingDesc")}</p>
              <p dir="ltr" className="selectable max-w-lg font-mono text-xs break-all text-fg-subtle">
                {shot.filePath}
              </p>
            </div>
          ) : (
            <ImageStage
              ref={stage}
              src={imageUrl(shot.id, shot.imageVersion)}
              width={shot.width}
              height={shot.height}
              alt={shot.name}
              words={shot.ocr?.words}
              highlight={highlight}
              onScaleChange={(s) => setZoom(s)}
            />
          )}
          {hasList ? (
            <>
              <button type="button" aria-label={t("viewer.previous")} disabled={!prev} onClick={() => go(-1)} className={cn(navBtn, "start-4 opacity-0 group-hover/stage:opacity-100")}>
                <ChevronLeft className="flip-rtl size-5" />
              </button>
              <button type="button" aria-label={t("viewer.next")} disabled={!next} onClick={() => go(1)} className={cn(navBtn, "end-4 opacity-0 group-hover/stage:opacity-100")}>
                <ChevronRight className="flip-rtl size-5" />
              </button>
            </>
          ) : null}
          {fullscreen ? (
            <button
              type="button"
              onClick={() => void setFs(false)}
              className="glass absolute end-4 top-4 flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs text-fg opacity-0 shadow-pop transition-opacity group-hover/stage:opacity-100"
            >
              <Minimize className="size-4" />
              {t("viewer.exitFullscreen")}
            </button>
          ) : null}
        </div>

        {panel && !fullscreen && shot ? (
          <aside className="flex w-[22rem] shrink-0 flex-col border-s border-border bg-surface">
            <Tabs.Root value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
              <Tabs.List>
                <Tabs.Trigger value="details">{t("viewer.tabs.details")}</Tabs.Trigger>
                <Tabs.Trigger value="text">{t("viewer.tabs.text")}</Tabs.Trigger>
                <Tabs.Trigger value="notes">
                  {t("viewer.tabs.notes")}
                  {shot.hasNote ? <span className="size-1.5 rounded-full bg-accent" /> : null}
                </Tabs.Trigger>
              </Tabs.List>
              <Tabs.Content value="details" className="flex min-h-0 flex-1 flex-col">
                <DetailsPanel shot={shot} />
              </Tabs.Content>
              <Tabs.Content value="text" className="flex min-h-0 flex-1 flex-col">
                <OcrPanel shot={shot} find={find} onFindChange={setFind} showOnImage={showOnImage} onShowOnImage={setShowOnImage} />
              </Tabs.Content>
              <Tabs.Content value="notes" className="flex min-h-0 flex-1 flex-col">
                <NotesPanel shot={shot} />
              </Tabs.Content>
            </Tabs.Root>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
