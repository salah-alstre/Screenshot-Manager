import { memo, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  FolderInput,
  Loader2,
  MoreHorizontal,
  PencilLine,
  RotateCcw,
  ScanText,
  StickyNote,
  Star,
  Trash2,
  Wand2,
  XCircle,
} from "lucide-react";
import { Context, Dropdown } from "@/components/ui/Menu";
import { IconButton } from "@/components/ui/IconButton";
import { TagChip } from "@/components/ui/feedback";
import { Tooltip } from "@/components/ui/Tooltip";
import { CollectionIcon } from "@/features/collections/icons";
import { useActions } from "@/hooks/useActions";
import { useCollections, useTags } from "@/hooks/useData";
import { useUi } from "@/stores/ui";
import type { ListQuery, ScreenshotSummary } from "@/types/models";
import { cn } from "@/utils/cn";
import { formatBytes, formatDate, formatDimensions, formatTime } from "@/utils/format";
import { Thumb } from "./Thumb";
import { renderContextEntries, renderDropdownEntries, useScreenshotMenu } from "./menuItems";

export interface CardContext {
  query: ListQuery;
  inTrash: boolean;
  selectionMode: boolean;
}

interface CardProps {
  shot: ScreenshotSummary;
  index: number;
  selected: boolean;
  focused: boolean;
  variant: "grid" | "large" | "compact";
  ctx: CardContext;
  targetIds: number[];
  onClick: (e: MouseEvent, index: number, id: number) => void;
  onToggle: (index: number, id: number) => void;
  onContext: (index: number, id: number) => void;
}

function MenuContent({ shot, targetIds, ctx, index, kind }: { shot: ScreenshotSummary; targetIds: number[]; ctx: CardContext; index: number; kind: "context" | "dropdown" }) {
  const entries = useScreenshotMenu(shot, targetIds, { query: ctx.query, index, inTrash: ctx.inTrash });
  return <>{kind === "context" ? renderContextEntries(entries) : renderDropdownEntries(entries)}</>;
}

export function OcrBadge({ status }: { status: ScreenshotSummary["ocrStatus"] }) {
  const { t } = useTranslation();
  if (status === "done")
    return (
      <Tooltip label={t("library.badges.ocrDone")}>
        <span className="inline-flex size-5 items-center justify-center rounded-md bg-black/55 text-white backdrop-blur">
          <ScanText className="size-3" />
        </span>
      </Tooltip>
    );
  if (status === "pending")
    return (
      <Tooltip label={t("library.badges.ocrPending")}>
        <span className="inline-flex size-5 items-center justify-center rounded-md bg-black/55 text-white backdrop-blur">
          <Loader2 className="size-3 animate-spin" />
        </span>
      </Tooltip>
    );
  if (status === "failed")
    return (
      <Tooltip label={t("library.badges.ocrFailed")}>
        <span className="inline-flex size-5 items-center justify-center rounded-md bg-danger/80 text-white">
          <ScanText className="size-3" />
        </span>
      </Tooltip>
    );
  return null;
}

export const ScreenshotCard = memo(function ScreenshotCard({
  shot,
  index,
  selected,
  focused,
  variant,
  ctx,
  targetIds,
  onClick,
  onToggle,
  onContext,
}: CardProps) {
  const { t, i18n } = useTranslation();
  const actions = useActions();
  const { byId: collections } = useCollections();
  const { byId: tagsById } = useTags();
  const lang = i18n.language;
  const collection = shot.collectionId ? collections.get(shot.collectionId) : undefined;
  const tags = shot.tagIds.map((id) => tagsById.get(id)).filter((x) => !!x);
  const showMeta = variant !== "compact";
  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <Context.Root onOpenChange={(open) => open && onContext(index, shot.id)}>
      <Context.Trigger asChild>
        <div
          role="gridcell"
          aria-selected={selected}
          data-index={index}
          onClick={(e) => onClick(e, index, shot.id)}
          onDoubleClick={() => actions.open(shot.id, ctx.query, index)}
          className={cn(
            "group relative flex h-full flex-col overflow-hidden rounded-xl border bg-surface transition-[box-shadow,border-color,transform] duration-200",
            selected ? "border-accent shadow-[0_0_0_1px_var(--accent)]" : "border-border hover:border-border-strong hover:shadow-card",
            focused && !selected && "border-border-strong shadow-[0_0_0_2px_var(--accent-ring)]",
          )}
        >
          <div className="relative min-h-0 flex-1">
            <Thumb id={shot.id} version={shot.imageVersion} alt={shot.name} className="size-full" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/15 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

            {/* Selection checkbox */}
            <button
              type="button"
              aria-label={t("menu.select")}
              aria-pressed={selected}
              onClick={(e) => {
                stop(e);
                onToggle(index, shot.id);
              }}
              className={cn(
                "absolute start-2 top-2 flex size-5 items-center justify-center rounded-md border transition-all duration-150",
                selected
                  ? "border-accent bg-accent text-accent-fg opacity-100"
                  : "border-white/70 bg-black/25 text-transparent opacity-0 backdrop-blur group-hover:opacity-100",
                ctx.selectionMode && "opacity-100",
              )}
            >
              <Check className="size-3.5" strokeWidth={3} />
            </button>

            {/* Favorite */}
            {!ctx.inTrash ? (
              <button
                type="button"
                aria-label={shot.isFavorite ? t("common.unfavorite") : t("common.favorite")}
                aria-pressed={shot.isFavorite}
                onClick={(e) => {
                  stop(e);
                  void actions.setFavorite([shot.id], !shot.isFavorite);
                }}
                className={cn(
                  "absolute end-2 top-2 flex size-6 items-center justify-center rounded-md transition-all duration-150 hover:scale-110",
                  shot.isFavorite ? "text-fav opacity-100 drop-shadow" : "bg-black/25 text-white opacity-0 backdrop-blur group-hover:opacity-100",
                )}
              >
                <Star className="size-4" fill={shot.isFavorite ? "currentColor" : "none"} />
              </button>
            ) : null}

            {/* Status badges */}
            <div className="absolute start-2 bottom-2 flex items-center gap-1 transition-opacity group-hover:opacity-0">
              <OcrBadge status={shot.ocrStatus} />
              {shot.hasEdit ? (
                <span title={t("library.badges.edited")} className="inline-flex size-5 items-center justify-center rounded-md bg-black/55 text-white backdrop-blur">
                  <Wand2 className="size-3" />
                </span>
              ) : null}
              {shot.hasNote ? (
                <span title={t("library.badges.note")} className="inline-flex size-5 items-center justify-center rounded-md bg-black/55 text-white backdrop-blur">
                  <StickyNote className="size-3" />
                </span>
              ) : null}
              {shot.missing ? (
                <span title={t("library.badges.missing")} className="inline-flex size-5 items-center justify-center rounded-md bg-warning text-white">
                  <AlertTriangle className="size-3" />
                </span>
              ) : null}
            </div>

            {/* Resolution */}
            <span
              dir="ltr"
              className="absolute end-2 bottom-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[0.625rem] font-medium text-white tabular-nums backdrop-blur transition-opacity group-hover:opacity-0"
            >
              {formatDimensions(t, shot.width, shot.height, lang)}
            </span>

            {/* Hover actions */}
            <div
              onClick={stop}
              onDoubleClick={stop}
              className="glass absolute bottom-2 left-1/2 flex -translate-x-1/2 translate-y-1 items-center gap-0.5 rounded-lg border border-white/10 p-0.5 opacity-0 shadow-pop transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 focus-within:opacity-100"
            >
              {ctx.inTrash ? (
                <>
                  <IconButton size="sm" label={t("common.restore")} onClick={() => void actions.restore([shot.id])}>
                    <RotateCcw className="size-3.5" />
                  </IconButton>
                  <IconButton size="sm" label={t("common.deletePermanently")} className="hover:text-danger" onClick={() => void actions.deletePermanently([shot.id])}>
                    <XCircle className="size-3.5" />
                  </IconButton>
                </>
              ) : (
                <>
                  <IconButton size="sm" label={t("common.open")} onClick={() => actions.open(shot.id, ctx.query, index)}>
                    <ExternalLink className="size-3.5" />
                  </IconButton>
                  <IconButton size="sm" label={t("common.copy")} disabled={shot.missing} onClick={() => void actions.copy(shot.id)}>
                    <Copy className="size-3.5" />
                  </IconButton>
                  <IconButton size="sm" label={t("common.edit")} disabled={shot.missing} onClick={() => actions.edit(shot.id)}>
                    <PencilLine className="size-3.5" />
                  </IconButton>
                  {variant !== "compact" ? (
                    <Dropdown.Root>
                      <Tooltip label={t("common.moveToCollection")}>
                        <Dropdown.Trigger asChild>
                          <button type="button" aria-label={t("common.moveToCollection")} className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg">
                            <FolderInput className="size-3.5" />
                          </button>
                        </Dropdown.Trigger>
                      </Tooltip>
                      <Dropdown.Content align="center">
                        <MoveMenu ids={targetIds} current={shot.collectionId} />
                      </Dropdown.Content>
                    </Dropdown.Root>
                  ) : null}
                  <IconButton size="sm" label={t("common.moveToTrash")} className="hover:text-danger" onClick={() => void actions.trash(targetIds)}>
                    <Trash2 className="size-3.5" />
                  </IconButton>
                  <Dropdown.Root>
                    <Tooltip label={t("common.more")}>
                      <Dropdown.Trigger asChild>
                        <button type="button" aria-label={t("common.more")} className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg">
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </Dropdown.Trigger>
                    </Tooltip>
                    <Dropdown.Content align="center">
                      <MenuContent shot={shot} targetIds={targetIds} ctx={ctx} index={index} kind="dropdown" />
                    </Dropdown.Content>
                  </Dropdown.Root>
                </>
              )}
            </div>
          </div>

          {showMeta ? (
            <div className="flex shrink-0 flex-col gap-1 px-3 pt-2 pb-2.5">
              <p className="truncate text-[0.8125rem] font-medium text-fg" title={shot.name}>
                {shot.name}
              </p>
              <p className="flex items-center justify-between gap-2 text-[0.6875rem] text-fg-subtle tabular-nums">
                <span className="truncate">
                  {formatDate(shot.capturedAt, lang, { month: "short", day: "numeric" })} · {formatTime(shot.capturedAt, lang)}
                </span>
                <span className="shrink-0">{formatBytes(t, shot.fileSize, lang)}</span>
              </p>
              {/* Always reserve the chip row so every card in the grid has the same height. */}
              {collection || tags.length ? (
                <div className="flex h-5 min-w-0 items-center gap-1 overflow-hidden">
                  {collection ? (
                    <span className="inline-flex h-5 min-w-0 shrink items-center gap-1 rounded-full bg-surface-2 pe-2 text-[0.6875rem] text-fg-muted">
                      <CollectionIcon icon={collection.icon} color={collection.color} size="xs" className="rounded-full" />
                      <span className="truncate">{collection.name}</span>
                    </span>
                  ) : null}
                  {tags.slice(0, 2).map((tag) => (
                    <TagChip key={tag.id} name={tag.name} color={tag.color} size="sm" />
                  ))}
                  {tags.length > 2 ? <span className="text-[0.6875rem] text-fg-subtle">+{tags.length - 2}</span> : null}
                </div>
              ) : (
                <div className="h-5" />
              )}
            </div>
          ) : null}
        </div>
      </Context.Trigger>
      <Context.Content>
        <MenuContent shot={shot} targetIds={targetIds} ctx={ctx} index={index} kind="context" />
      </Context.Content>
    </Context.Root>
  );
});

export function MoveMenu({ ids, current }: { ids: number[]; current: number | null }) {
  const { t } = useTranslation();
  const actions = useActions();
  const { collections } = useCollections();
  return (
    <>
      <Dropdown.Label>{t("menu.moveToCollection")}</Dropdown.Label>
      {collections.map((c) => (
        <Dropdown.Item
          key={c.id}
          icon={<CollectionIcon icon={c.icon} color={c.color} size="xs" />}
          disabled={ids.length === 1 && current === c.id}
          onSelect={() => void actions.moveToCollection(ids, c.id)}
        >
          {c.name}
        </Dropdown.Item>
      ))}
      {collections.length ? <Dropdown.Separator /> : null}
      {current !== null || ids.length > 1 ? (
        <Dropdown.Item onSelect={() => void actions.moveToCollection(ids, null)}>{t("menu.noCollection")}</Dropdown.Item>
      ) : null}
      <NewCollectionItem ids={ids} />
    </>
  );
}

function NewCollectionItem({ ids }: { ids: number[] }) {
  const { t } = useTranslation();
  return (
    <Dropdown.Item onSelect={() => useUi.getState().openDialog("collection", { assignIds: ids })}>
      <span className="text-accent">{t("menu.newCollection")}</span>
    </Dropdown.Item>
  );
}
