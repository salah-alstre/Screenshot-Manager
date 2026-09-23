import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { ArrowDownUp, Grid2X2, Grid3X3, LayoutGrid, List, SearchX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Menu";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Segmented } from "@/components/ui/controls";
import { useActions } from "@/hooks/useActions";
import { useElementSize } from "@/hooks/useElementSize";
import { usePagedScreenshots } from "@/hooks/usePagedScreenshots";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { api } from "@/services/api";
import { useSelection } from "@/stores/selection";
import { useUi } from "@/stores/ui";
import type { ListQuery, Settings, SortKey } from "@/types/models";
import { isTypingTarget, matches } from "@/utils/keys";
import { BulkBar } from "./BulkBar";
import { FilterPopover } from "./FilterPopover";
import { activeFilterCount, EMPTY_FILTERS, filtersToQuery, type Filters } from "./filters";
import { ScreenshotCard, type CardContext } from "./ScreenshotCard";
import { ListHeader, ScreenshotRow } from "./ScreenshotRow";

export interface LibraryViewProps {
  listKey: string;
  baseQuery: ListQuery;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  headerActions?: ReactNode;
  banner?: ReactNode;
  empty: { icon: ReactNode; title: string; description: string; action?: ReactNode };
  inTrash?: boolean;
  hideCollectionFilter?: boolean;
  hideFavoriteFilter?: boolean;
  allowSort?: boolean;
}

const PAD = 24;

function layoutFor(view: Settings["libraryView"], width: number, thumb: number) {
  const inner = Math.max(0, width - PAD * 2);
  if (view === "list") return { cols: 1, gap: 2, rowH: 52, inner };
  const gap = view === "compact" ? 10 : 16;
  const base = thumb * (view === "large" ? 1.55 : view === "compact" ? 0.72 : 1);
  const cols = Math.max(1, Math.floor((inner + gap) / (base + gap)));
  const cardW = (inner - gap * (cols - 1)) / cols;
  const thumbH = Math.round(cardW * (view === "compact" ? 0.68 : 0.625));
  // Footer: name + date/size + chip row (see ScreenshotCard).
  const meta = view === "compact" ? 0 : 100;
  return { cols, gap, rowH: thumbH + meta, inner };
}

/** A few ids may be missing when pages haven't loaded yet; range selection skips them. */
function rangeIds(get: (i: number) => { id: number } | undefined, a: number, b: number): number[] {
  const ids: number[] = [];
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
    const it = get(i);
    if (it) ids.push(it.id);
  }
  return ids;
}

export function LibraryView(props: LibraryViewProps) {
  const { listKey, baseQuery, title, subtitle, icon, headerActions, banner, empty, inTrash = false } = props;
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();
  const actions = useActions();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const view = settings.libraryView;
  const sort: SortKey | undefined = inTrash || props.allowSort === false ? undefined : settings.librarySort;

  const query = useMemo<ListQuery>(
    () => ({ ...baseQuery, ...filtersToQuery(filters), ...(sort ? { sort } : {}) }),
    [baseQuery, filters, sort],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(scrollRef);
  const { cols, gap, rowH } = layoutFor(view, width, settings.thumbnailSize);
  const [range, setRange] = useState<[number, number]>([0, 80]);
  const paged = usePagedScreenshots(query, range);
  const total = paged.total;
  const rowCount = Math.ceil(total / cols);
  const listHeaderH = view === "list" ? 36 : 0;

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH + gap,
    overscan: 3,
    paddingStart: 8 + listHeaderH,
    paddingEnd: 96,
  });

  useLayoutEffect(() => {
    virtualizer.measure();
  }, [rowH, gap, cols, virtualizer]);

  const items = virtualizer.getVirtualItems();
  const firstRow = items[0]?.index ?? 0;
  const lastRow = items[items.length - 1]?.index ?? 0;
  useEffect(() => {
    const next: [number, number] = [firstRow * cols, (lastRow + 1) * cols - 1];
    setRange((prev) => (prev[0] === next[0] && prev[1] === next[1] ? prev : next));
  }, [firstRow, lastRow, cols]);

  // Selection is scoped to this list.
  const selection = useSelection();
  const selectedIds = selection.ids;
  const focusIndex = selection.focusIndex;
  useEffect(() => {
    useSelection.getState().reset(listKey);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [listKey]);
  useEffect(() => {
    useSelection.getState().clear();
  }, [filters, sort]);

  const ctx: CardContext = useMemo(() => ({ query, inTrash, selectionMode: selectedIds.size > 0 }), [query, inTrash, selectedIds.size]);

  const onClick = useCallback(
    (e: MouseEvent, index: number, id: number) => {
      const sel = useSelection.getState();
      sel.setFocusIndex(index);
      if (e.shiftKey && sel.anchor !== null) {
        const ids = rangeIds(paged.getItem, sel.anchor, index);
        sel.setIds(e.ctrlKey ? new Set([...sel.ids, ...ids]) : ids);
      } else if (e.ctrlKey || e.metaKey || sel.ids.size > 0) {
        sel.toggle(id);
        sel.setAnchor(index);
      } else {
        sel.setAnchor(index);
      }
    },
    [paged.getItem],
  );
  const onToggle = useCallback((index: number, id: number) => {
    const sel = useSelection.getState();
    sel.toggle(id);
    sel.setAnchor(index);
    sel.setFocusIndex(index);
  }, []);
  const onContext = useCallback((index: number, id: number) => {
    const sel = useSelection.getState();
    if (!sel.ids.has(id)) sel.clear();
    sel.setFocusIndex(index);
  }, []);

  const selectAll = useCallback(async () => {
    const ids = await api.listScreenshotIds(query);
    useSelection.getState().setIds(ids);
  }, [query]);

  // Keyboard navigation and shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUi.getState();
      if (ui.viewer || ui.editorId !== null || ui.paletteOpen || Object.values(ui.dialogs).some(Boolean)) return;
      if (isTypingTarget(e.target) || document.querySelector("[data-radix-popper-content-wrapper]")) return;
      const sel = useSelection.getState();
      const kb = settings.keybindings;
      const rtl = document.documentElement.dir === "rtl";
      const move = (delta: number) => {
        if (!total) return;
        const next = Math.max(0, Math.min(total - 1, (sel.focusIndex < 0 ? -1 : sel.focusIndex) + delta));
        sel.setFocusIndex(next);
        if (e.shiftKey) {
          const anchor = sel.anchor ?? Math.max(0, sel.focusIndex);
          sel.setAnchor(anchor);
          sel.setIds(rangeIds(paged.getItem, anchor, next));
        } else {
          sel.setAnchor(next);
        }
        virtualizer.scrollToIndex(Math.floor(next / cols), { align: "auto" });
        e.preventDefault();
      };
      const focused = sel.focusIndex >= 0 ? paged.getItem(sel.focusIndex) : undefined;
      const targets = sel.ids.size ? [...sel.ids] : focused ? [focused.id] : [];

      switch (e.key) {
        case "ArrowRight":
          return move(view === "list" ? 0 : rtl ? -1 : 1);
        case "ArrowLeft":
          return move(view === "list" ? 0 : rtl ? 1 : -1);
        case "ArrowDown":
          return move(cols);
        case "ArrowUp":
          return move(-cols);
        case "Home":
          return move(-total);
        case "End":
          return move(total);
        case " ":
          if (focused) {
            sel.toggle(focused.id);
            e.preventDefault();
          }
          return;
        case "Escape":
          if (sel.ids.size) sel.clear();
          else sel.setFocusIndex(-1);
          return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyA") {
        e.preventDefault();
        void selectAll();
        return;
      }
      if (matches(e, kb.open) && focused) {
        e.preventDefault();
        actions.open(focused.id, query, sel.focusIndex);
      } else if (matches(e, kb.delete) && targets.length) {
        e.preventDefault();
        if (inTrash) void actions.deletePermanently(targets);
        else void actions.trash(targets);
      } else if (inTrash) {
        return;
      } else if (matches(e, kb.favorite) && targets.length) {
        e.preventDefault();
        const fav = sel.ids.size ? true : !focused?.isFavorite;
        void actions.setFavorite(targets, fav);
      } else if (matches(e, kb.edit) && focused) {
        e.preventDefault();
        actions.edit(focused.id);
      } else if (matches(e, kb.copy) && focused) {
        e.preventDefault();
        void actions.copy(focused.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings.keybindings, total, cols, view, paged.getItem, virtualizer, actions, query, inTrash, selectAll]);

  const filterCount = activeFilterCount(filters);
  const searching = !!baseQuery.search;

  const sortOptions: SortKey[] = ["newest", "oldest", "added", "largest", "smallest", "name"];

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 px-6 pt-5 pb-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {icon}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-[-0.01em] text-fg">{title}</h1>
            <p className="mt-0.5 truncate text-[0.8125rem] text-fg-muted">
              {subtitle ?? (paged.isLoading ? " " : t("format.screenshots", { count: total }))}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {headerActions}
          <FilterPopover filters={filters} onChange={setFilters} hideCollections={props.hideCollectionFilter} hideFavorites={props.hideFavoriteFilter} />
          {sort ? (
            <Dropdown.Root>
              <Dropdown.Trigger asChild>
                <Button icon={<ArrowDownUp className="size-4" />} aria-label={t("library.sort.label")}>
                  <span className="hidden lg:inline">{t(`library.sort.${sort}`)}</span>
                </Button>
              </Dropdown.Trigger>
              <Dropdown.Content>
                <Dropdown.Label>{t("library.sort.label")}</Dropdown.Label>
                {sortOptions.map((s) => (
                  <Dropdown.Radio key={s} checked={sort === s} onSelect={() => void update({ librarySort: s })}>
                    {t(`library.sort.${s}`)}
                  </Dropdown.Radio>
                ))}
              </Dropdown.Content>
            </Dropdown.Root>
          ) : null}
          <Segmented
            value={view}
            onChange={(v) => void update({ libraryView: v })}
            options={[
              { value: "grid", label: null, icon: <LayoutGrid />, title: t("library.views.grid") },
              { value: "large", label: null, icon: <Grid2X2 />, title: t("library.views.large") },
              { value: "compact", label: null, icon: <Grid3X3 />, title: t("library.views.compact") },
              { value: "list", label: null, icon: <List />, title: t("library.views.list") },
            ]}
          />
        </div>
      </header>
      {banner}

      <div ref={scrollRef} role="grid" aria-label={typeof title === "string" ? title : undefined} className="relative min-h-0 flex-1 overflow-y-auto" tabIndex={-1}>
        {paged.isLoading ? (
          <div className="grid gap-4 px-6 pt-2" style={{ gridTemplateColumns: `repeat(${Math.max(cols, 1)}, minmax(0, 1fr))` }}>
            {Array.from({ length: Math.max(cols, 1) * 3 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-border bg-surface" style={{ height: view === "list" ? 52 : rowH }}>
                <Skeleton className="h-[62%] rounded-none" />
                <div className="space-y-2 p-3">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : paged.isError ? (
          <EmptyState icon={<SearchX />} title={t("errors.loadFailed")} action={<Button onClick={() => void paged.refetch()}>{t("common.retry")}</Button>} />
        ) : total === 0 ? (
          searching || filterCount ? (
            <EmptyState
              icon={<SearchX />}
              title={searching ? t("library.empty.searchTitle") : t("library.empty.filteredTitle")}
              description={searching ? t("library.empty.searchDesc") : t("library.empty.filteredDesc")}
              action={filterCount ? <Button onClick={() => setFilters(EMPTY_FILTERS)}>{t("library.filters.clear")}</Button> : undefined}
            />
          ) : (
            <EmptyState icon={empty.icon} title={empty.title} description={empty.description} action={empty.action} />
          )
        ) : (
          <>
            {view === "list" ? (
              <div className="sticky top-0 z-10 px-6" style={{ height: 0 }}>
                <ListHeader />
              </div>
            ) : null}
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {items.map((row) => (
                <div
                  key={row.key}
                  className="absolute inset-x-0 grid px-6"
                  style={{
                    top: row.start,
                    height: rowH,
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    columnGap: gap,
                  }}
                >
                  {Array.from({ length: cols }).map((_, c) => {
                    const index = row.index * cols + c;
                    if (index >= total) return <div key={`empty-${c}`} />;
                    const shot = paged.getItem(index);
                    if (!shot) return <Skeleton key={`loading-${c}`} className="h-full rounded-xl" />;
                    const selected = selectedIds.has(shot.id);
                    const targetIds = selected ? [...selectedIds] : [shot.id];
                    return view === "list" ? (
                      <ScreenshotRow
                        key={shot.id}
                        shot={shot}
                        index={index}
                        selected={selected}
                        focused={focusIndex === index}
                        ctx={ctx}
                        targetIds={targetIds}
                        onClick={onClick}
                        onToggle={onToggle}
                        onContext={onContext}
                      />
                    ) : (
                      <ScreenshotCard
                        key={shot.id}
                        shot={shot}
                        index={index}
                        selected={selected}
                        focused={focusIndex === index}
                        variant={view}
                        ctx={ctx}
                        targetIds={targetIds}
                        onClick={onClick}
                        onToggle={onToggle}
                        onContext={onContext}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <BulkBar inTrash={inTrash} onSelectAll={() => void selectAll()} />
    </div>
  );
}
