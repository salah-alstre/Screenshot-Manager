import type { ReactNode } from "react";
import { Popover } from "radix-ui";
import { useTranslation } from "react-i18next";
import { Check, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Segmented, Switch } from "@/components/ui/controls";
import { CollectionIcon } from "@/features/collections/icons";
import { useCollections, useTags } from "@/hooks/useData";
import { cn } from "@/utils/cn";
import { colorHex } from "@/utils/colors";
import { parseDateInput, toDateInput } from "@/utils/dates";
import { activeFilterCount, EMPTY_FILTERS, type Filters } from "./filters";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[0.6875rem] font-semibold tracking-wide text-fg-subtle uppercase">{label}</span>
      {children}
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
        active ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
      )}
    >
      {active ? <Check className="size-3" /> : null}
      {children}
    </button>
  );
}

export function FilterPopover({
  filters,
  onChange,
  hideCollections,
  hideFavorites,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  hideCollections?: boolean;
  hideFavorites?: boolean;
}) {
  const { t } = useTranslation();
  const { collections } = useCollections();
  const { tags } = useTags();
  const count = activeFilterCount(filters);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const toggleId = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const dates: { v: Filters["date"]; label: string }[] = [
    { v: "any", label: t("library.filters.anyDate") },
    { v: "today", label: t("library.filters.today") },
    { v: "yesterday", label: t("library.filters.yesterday") },
    { v: "week", label: t("library.filters.thisWeek") },
    { v: "month", label: t("library.filters.thisMonth") },
    { v: "custom", label: t("library.filters.custom") },
  ];

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          size="md"
          variant={count ? "subtle" : "secondary"}
          icon={<SlidersHorizontal className="size-4" />}
          className={cn(count && "text-accent")}
        >
          {count ? t("library.filters.active", { count }) : t("library.filters.button")}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="glass z-[80] flex max-h-[75vh] w-[23rem] animate-scale-in flex-col gap-4 overflow-y-auto rounded-2xl border border-border p-4 shadow-pop"
        >
          <Row label={t("library.filters.date")}>
            <div className="flex flex-wrap gap-1.5">
              {dates.map((d) => (
                <Pill key={d.v} active={filters.date === d.v} onClick={() => set({ date: d.v })}>
                  {d.label}
                </Pill>
              ))}
            </div>
            {filters.date === "custom" ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-fg-muted">
                  {t("library.filters.from")}
                  <Input type="date" value={toDateInput(filters.from)} onChange={(e) => set({ from: parseDateInput(e.target.value) })} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-fg-muted">
                  {t("library.filters.to")}
                  <Input type="date" value={toDateInput(filters.to)} onChange={(e) => set({ to: parseDateInput(e.target.value) })} />
                </label>
              </div>
            ) : null}
          </Row>

          <Row label={t("library.filters.text")}>
            <Segmented
              value={filters.ocr}
              onChange={(ocr) => set({ ocr })}
              options={[
                { value: "any", label: t("library.filters.anyText") },
                { value: "with", label: t("library.filters.withText") },
                { value: "without", label: t("library.filters.withoutText") },
              ]}
            />
          </Row>

          <div className="flex flex-col gap-3">
            {!hideFavorites ? (
              <label className="flex items-center justify-between gap-3 text-[0.8125rem] text-fg">
                {t("library.filters.favoritesOnly")}
                <Switch checked={filters.favoritesOnly} onChange={(v) => set({ favoritesOnly: v })} label={t("library.filters.favoritesOnly")} />
              </label>
            ) : null}
            <label className="flex items-center justify-between gap-3 text-[0.8125rem] text-fg">
              <span className="flex flex-col">
                {t("library.filters.largeOnly")}
                <span className="text-xs text-fg-subtle">{t("library.filters.largeDesc")}</span>
              </span>
              <Switch checked={filters.largeOnly} onChange={(v) => set({ largeOnly: v })} label={t("library.filters.largeOnly")} />
            </label>
          </div>

          <Row label={t("library.filters.dimensions")}>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder={t("library.filters.minWidth")}
                aria-label={t("library.filters.minWidth")}
                value={filters.minWidth ?? ""}
                onChange={(e) => set({ minWidth: e.target.value ? Math.max(0, Number(e.target.value)) : undefined })}
              />
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder={t("library.filters.minHeight")}
                aria-label={t("library.filters.minHeight")}
                value={filters.minHeight ?? ""}
                onChange={(e) => set({ minHeight: e.target.value ? Math.max(0, Number(e.target.value)) : undefined })}
              />
            </div>
          </Row>

          {!hideCollections && collections.length ? (
            <Row label={t("library.filters.collections")}>
              <div className="flex flex-wrap gap-1.5">
                {collections.map((c) => (
                  <Pill key={c.id} active={filters.collectionIds.includes(c.id)} onClick={() => set({ collectionIds: toggleId(filters.collectionIds, c.id) })}>
                    <CollectionIcon icon={c.icon} color={c.color} size="xs" className="-ms-1 size-4" />
                    {c.name}
                  </Pill>
                ))}
              </div>
            </Row>
          ) : null}

          {tags.length ? (
            <Row label={t("library.filters.tags")}>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <Pill key={tag.id} active={filters.tagIds.includes(tag.id)} onClick={() => set({ tagIds: toggleId(filters.tagIds, tag.id) })}>
                    <span className="size-2 rounded-full" style={{ background: colorHex(tag.color) }} />
                    <span dir="auto">#{tag.name}</span>
                  </Pill>
                ))}
              </div>
            </Row>
          ) : null}

          {count ? (
            <Button variant="ghost" className="self-start" onClick={() => onChange(EMPTY_FILTERS)}>
              {t("library.filters.clear")}
            </Button>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
