import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Hash, PencilLine, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { useTags } from "@/hooks/useData";
import { api } from "@/services/api";
import { errorMessage } from "@/services/errors";
import { invalidateLibrary } from "@/services/queryClient";
import { toast } from "@/stores/toast";
import { confirm, useUi } from "@/stores/ui";
import type { Tag } from "@/types/models";
import { colorHex, softBg } from "@/utils/colors";
import { formatNumber } from "@/utils/format";
import { normalize } from "@/utils/normalize";

export function TagsPage() {
  const { t, i18n } = useTranslation();
  const { tags, isLoading } = useTags();
  const navigate = useUi((s) => s.navigate);
  const openDialog = useUi((s) => s.openDialog);
  const [filter, setFilter] = useState("");
  const q = normalize(filter.trim().replace(/^#/, ""));
  const visible = useMemo(() => (q ? tags.filter((x) => normalize(x.name).includes(q)) : tags), [tags, q]);
  const max = Math.max(1, ...tags.map((x) => x.count));

  const remove = async (tag: Tag) => {
    const ok = await confirm({ title: t("tags.deleteTitle", { name: tag.name }), description: t("tags.deleteDesc"), confirmLabel: t("common.delete"), danger: true });
    if (!ok) return;
    try {
      await api.deleteTag(tag.id);
      invalidateLibrary(true);
      toast.success(t("tags.deleted"));
    } catch (e) {
      toast.error(errorMessage(t, e));
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-5">
        <header className="mb-5 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Hash className="size-5" />
          </span>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-[-0.01em] text-fg">{t("tags.title")}</h1>
            <p className="mt-0.5 text-[0.8125rem] text-fg-muted">{t("tags.subtitle")}</p>
          </div>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openDialog("tag", {})}>
            {t("tags.new")}
          </Button>
        </header>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : tags.length === 0 ? (
          <EmptyState
            icon={<Hash />}
            title={t("tags.emptyTitle")}
            description={t("tags.emptyDesc")}
            action={
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openDialog("tag", {})}>
                {t("tags.new")}
              </Button>
            }
          />
        ) : (
          <>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("tags.filterPlaceholder")}
                aria-label={t("tags.filterPlaceholder")}
                className="h-9 w-full rounded-lg border border-border bg-surface ps-9 pe-3 text-[0.8125rem] text-fg shadow-soft placeholder:text-fg-subtle focus:border-accent"
              />
            </div>
            <ul className="flex flex-col gap-1.5">
              {visible.map((tag) => (
                <li key={tag.id} className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-soft transition-colors hover:border-border-strong">
                  <button type="button" onClick={() => navigate({ page: "tag", id: tag.id })} className="flex min-w-0 flex-1 items-center gap-3 text-start">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: softBg(tag.color, 18), color: colorHex(tag.color) }}>
                      <Hash className="size-4" />
                    </span>
                    <span className="min-w-0 truncate text-[0.875rem] font-medium text-fg">
                      {tag.name}
                    </span>
                    <span className="ms-auto hidden h-1.5 w-32 overflow-hidden rounded-full bg-surface-3 sm:block">
                      <span className="block h-full rounded-full" style={{ width: `${(tag.count / max) * 100}%`, background: colorHex(tag.color) }} />
                    </span>
                    <span className="w-24 shrink-0 text-end text-xs text-fg-subtle tabular-nums">{t("format.screenshots", { count: tag.count, formatted: formatNumber(tag.count, i18n.language) })}</span>
                  </button>
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <IconButton size="sm" label={t("common.edit")} onClick={() => openDialog("tag", { tag })}>
                      <PencilLine className="size-3.5" />
                    </IconButton>
                    <IconButton size="sm" label={t("common.delete")} className="hover:text-danger" onClick={() => void remove(tag)}>
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
