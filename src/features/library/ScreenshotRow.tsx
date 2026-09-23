import { memo, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2, ScanText, Star } from "lucide-react";
import { Context } from "@/components/ui/Menu";
import { TagChip } from "@/components/ui/feedback";
import { CollectionIcon } from "@/features/collections/icons";
import { useActions } from "@/hooks/useActions";
import { useCollections, useTags } from "@/hooks/useData";
import type { ScreenshotSummary } from "@/types/models";
import { cn } from "@/utils/cn";
import { formatBytes, formatDateTime, formatDimensions } from "@/utils/format";
import { Thumb } from "./Thumb";
import { renderContextEntries, useScreenshotMenu } from "./menuItems";
import type { CardContext } from "./ScreenshotCard";

export const LIST_COLUMNS = "grid-cols-[2rem_3.5rem_minmax(12rem,2.2fr)_minmax(11.5rem,1.2fr)_7rem_5.5rem_minmax(8rem,1fr)_minmax(8rem,1.2fr)_3rem]";

export function ListHeader() {
  const { t } = useTranslation();
  const cell = "truncate text-[0.6875rem] font-semibold tracking-wide text-fg-subtle uppercase";
  return (
    <div className={cn("sticky top-0 z-10 grid h-9 items-center gap-3 border-b border-border bg-bg/95 px-3 backdrop-blur", LIST_COLUMNS)}>
      <span />
      <span />
      <span className={cell}>{t("library.columns.name")}</span>
      <span className={cell}>{t("library.columns.captured")}</span>
      <span className={cell}>{t("library.columns.resolution")}</span>
      <span className={cell}>{t("library.columns.size")}</span>
      <span className={cell}>{t("library.columns.collection")}</span>
      <span className={cell}>{t("library.columns.tags")}</span>
      <span className={cell}>{t("library.columns.text")}</span>
    </div>
  );
}

function RowMenu({ shot, targetIds, ctx, index }: { shot: ScreenshotSummary; targetIds: number[]; ctx: CardContext; index: number }) {
  const entries = useScreenshotMenu(shot, targetIds, { query: ctx.query, index, inTrash: ctx.inTrash });
  return <>{renderContextEntries(entries)}</>;
}

export const ScreenshotRow = memo(function ScreenshotRow({
  shot,
  index,
  selected,
  focused,
  ctx,
  targetIds,
  onClick,
  onToggle,
  onContext,
}: {
  shot: ScreenshotSummary;
  index: number;
  selected: boolean;
  focused: boolean;
  ctx: CardContext;
  targetIds: number[];
  onClick: (e: MouseEvent, index: number, id: number) => void;
  onToggle: (index: number, id: number) => void;
  onContext: (index: number, id: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const actions = useActions();
  const { byId: collections } = useCollections();
  const { byId: tagsById } = useTags();
  const collection = shot.collectionId ? collections.get(shot.collectionId) : undefined;
  const tags = shot.tagIds.map((id) => tagsById.get(id)).filter((x) => !!x);

  return (
    <Context.Root onOpenChange={(open) => open && onContext(index, shot.id)}>
      <Context.Trigger asChild>
        <div
          role="row"
          aria-selected={selected}
          onClick={(e) => onClick(e, index, shot.id)}
          onDoubleClick={() => actions.open(shot.id, ctx.query, index)}
          className={cn(
            "group grid h-full items-center gap-3 rounded-lg px-3 text-[0.8125rem] transition-colors",
            LIST_COLUMNS,
            selected ? "bg-accent-soft" : "hover:bg-surface-2",
            focused && !selected && "shadow-[inset_0_0_0_2px_var(--accent-ring)]",
          )}
        >
          <button
            type="button"
            aria-label={t("menu.select")}
            aria-pressed={selected}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(index, shot.id);
            }}
            className={cn(
              "flex size-4.5 items-center justify-center rounded border transition-opacity",
              selected ? "border-accent bg-accent text-accent-fg" : "border-border-strong text-transparent opacity-0 group-hover:opacity-100",
              ctx.selectionMode && "opacity-100",
            )}
          >
            <Check className="size-3" strokeWidth={3} />
          </button>
          <Thumb id={shot.id} version={shot.imageVersion} alt={shot.name} className="h-9 w-14 rounded-md border border-border" />
          <div className="flex min-w-0 items-center gap-1.5">
            {shot.isFavorite ? <Star className="size-3.5 shrink-0 text-fav" fill="currentColor" /> : null}
            <span className="truncate font-medium text-fg" title={shot.name}>
              {shot.name}
            </span>
          </div>
          <span className="truncate text-fg-muted tabular-nums">{formatDateTime(shot.capturedAt, lang)}</span>
          <span className="truncate text-fg-muted tabular-nums" dir="ltr">
            {formatDimensions(t, shot.width, shot.height, lang)}
          </span>
          <span className="truncate text-fg-muted tabular-nums">{formatBytes(t, shot.fileSize, lang)}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-fg-muted">
            {collection ? (
              <>
                <CollectionIcon icon={collection.icon} color={collection.color} size="xs" />
                <span className="truncate">{collection.name}</span>
              </>
            ) : (
              <span className="text-fg-subtle">—</span>
            )}
          </span>
          <span className="flex min-w-0 items-center gap-1 overflow-hidden">
            {tags.slice(0, 2).map((tag) => (
              <TagChip key={tag.id} name={tag.name} color={tag.color} size="sm" />
            ))}
            {tags.length > 2 ? <span className="text-[0.6875rem] text-fg-subtle">+{tags.length - 2}</span> : null}
          </span>
          <span className="flex justify-center" title={t(`library.badges.ocr${shot.ocrStatus[0]!.toUpperCase()}${shot.ocrStatus.slice(1)}`)}>
            {shot.ocrStatus === "done" ? (
              <ScanText className="size-4 text-success" />
            ) : shot.ocrStatus === "pending" ? (
              <Loader2 className="size-4 animate-spin text-accent" />
            ) : (
              <ScanText className="size-4 text-fg-subtle/50" />
            )}
          </span>
        </div>
      </Context.Trigger>
      <Context.Content>
        <RowMenu shot={shot} targetIds={targetIds} ctx={ctx} index={index} />
      </Context.Content>
    </Context.Root>
  );
});
