import { useTranslation } from "react-i18next";
import { Download, FolderClosed, FolderPlus, MoreHorizontal, PencilLine, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Context, Dropdown } from "@/components/ui/Menu";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { CollectionIcon } from "@/features/collections/icons";
import { Thumb } from "@/features/library/Thumb";
import { useActions } from "@/hooks/useActions";
import { useCollections } from "@/hooks/useData";
import { api } from "@/services/api";
import { errorMessage } from "@/services/errors";
import { invalidateLibrary } from "@/services/queryClient";
import { toast } from "@/stores/toast";
import { confirm, useUi } from "@/stores/ui";
import type { Collection } from "@/types/models";
import { formatBytes } from "@/utils/format";
import { softBg } from "@/utils/colors";

const SUGGESTIONS: { key: string; icon: string; color: string; en: string; ar: string }[] = [
  { key: "programming", icon: "code", color: "violet", en: "Programming", ar: "البرمجة" },
  { key: "work", icon: "briefcase", color: "blue", en: "Work", ar: "العمل" },
  { key: "receipts", icon: "receipt", color: "green", en: "Receipts", ar: "الإيصالات" },
  { key: "design", icon: "palette", color: "pink", en: "Design Inspiration", ar: "إلهام التصميم" },
  { key: "errors", icon: "bug", color: "red", en: "Errors", ar: "الأخطاء" },
  { key: "docs", icon: "book", color: "amber", en: "Documentation", ar: "التوثيق" },
];

function useCollectionActions() {
  const { t } = useTranslation();
  const openDialog = useUi((s) => s.openDialog);
  const actions = useActions();
  return {
    edit: (c: Collection) => openDialog("collection", { collection: c }),
    exportAll: (c: Collection) => actions.exportCollection(c.id),
    remove: async (c: Collection) => {
      const ok = await confirm({ title: t("collections.deleteTitle", { name: c.name }), description: t("collections.deleteDesc"), confirmLabel: t("common.delete"), danger: true });
      if (!ok) return;
      try {
        await api.deleteCollection(c.id);
        invalidateLibrary(true);
        toast.success(t("collections.deleted"));
      } catch (e) {
        toast.error(errorMessage(t, e));
      }
    },
  };
}

function CollectionCard({ c }: { c: Collection }) {
  const { t, i18n } = useTranslation();
  const navigate = useUi((s) => s.navigate);
  const ca = useCollectionActions();
  const covers = c.coverIds.slice(0, 3);
  const items = (
    kind: "context" | "dropdown",
  ) => {
    const M = kind === "context" ? Context : Dropdown;
    return (
      <>
        <M.Item icon={<PencilLine />} onSelect={() => ca.edit(c)}>
          {t("common.edit")}
        </M.Item>
        <M.Item icon={<Download />} disabled={!c.count} onSelect={() => ca.exportAll(c)}>
          {t("collections.exportAll")}
        </M.Item>
        <M.Separator />
        <M.Item icon={<Trash2 />} danger onSelect={() => void ca.remove(c)}>
          {t("common.delete")}
        </M.Item>
      </>
    );
  };
  return (
    <Context.Root>
      <Context.Trigger asChild>
        <div className="group relative overflow-hidden rounded-2xl border border-border bg-surface shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card">
          <button type="button" onClick={() => navigate({ page: "collection", id: c.id })} className="block w-full text-start" aria-label={c.name}>
            <div className="relative grid aspect-[16/9] grid-cols-3 grid-rows-2 gap-0.5 overflow-hidden" style={{ background: softBg(c.color, 12) }}>
              {covers.length ? (
                covers.map((id, i) => (
                  <Thumb key={id} id={id} version={c.updatedAt} alt="" className={covers.length === 1 ? "col-span-3 row-span-2" : i === 0 ? "col-span-2 row-span-2" : covers.length === 2 ? "row-span-2" : ""} />
                ))
              ) : (
                <div className="col-span-3 row-span-2 flex items-center justify-center">
                  <CollectionIcon icon={c.icon} color={c.color} size="lg" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 p-3.5">
              <CollectionIcon icon={c.icon} color={c.color} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.875rem] font-semibold text-fg">{c.name}</p>
                <p className="mt-0.5 text-xs text-fg-subtle">
                  {t("format.screenshots", { count: c.count })} · {formatBytes(t, c.totalSize, i18n.language)}
                </p>
              </div>
            </div>
          </button>
          <Dropdown.Root>
            <Dropdown.Trigger asChild>
              <button
                type="button"
                aria-label={t("common.more")}
                className="glass absolute end-2.5 top-2.5 flex size-8 items-center justify-center rounded-lg border border-border text-fg opacity-0 shadow-soft transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </Dropdown.Trigger>
            <Dropdown.Content>{items("dropdown")}</Dropdown.Content>
          </Dropdown.Root>
        </div>
      </Context.Trigger>
      <Context.Content>{items("context")}</Context.Content>
    </Context.Root>
  );
}

export function CollectionsPage() {
  const { t, i18n } = useTranslation();
  const { collections, isLoading } = useCollections();
  const openDialog = useUi((s) => s.openDialog);
  const existing = new Set(collections.map((c) => c.name.toLowerCase()));

  const createSuggestion = async (s: (typeof SUGGESTIONS)[number]) => {
    try {
      await api.createCollection(i18n.language === "ar" ? s.ar : s.en, s.icon, s.color);
      invalidateLibrary(true);
      toast.success(t("collections.created"));
    } catch (e) {
      toast.error(errorMessage(t, e));
    }
  };

  const suggestions = SUGGESTIONS.filter((s) => !existing.has((i18n.language === "ar" ? s.ar : s.en).toLowerCase()));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-5">
        <header className="mb-6 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <FolderClosed className="size-5" />
          </span>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-[-0.01em] text-fg">{t("collections.title")}</h1>
            <p className="mt-0.5 text-[0.8125rem] text-fg-muted">{t("collections.subtitle")}</p>
          </div>
          <Button variant="primary" icon={<FolderPlus className="size-4" />} onClick={() => openDialog("collection", {})}>
            {t("collections.new")}
          </Button>
        </header>

        {isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </div>
        ) : collections.length === 0 ? (
          <EmptyState
            icon={<FolderClosed />}
            title={t("collections.emptyTitle")}
            description={t("collections.emptyDesc")}
            action={
              <Button variant="primary" icon={<FolderPlus className="size-4" />} onClick={() => openDialog("collection", {})}>
                {t("collections.new")}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
            {collections.map((c) => (
              <CollectionCard key={c.id} c={c} />
            ))}
          </div>
        )}

        {!isLoading && suggestions.length ? (
          <section className="mt-8">
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t("collections.suggestions")}</h2>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => void createSuggestion(s)}
                  className="flex h-9 items-center gap-2 rounded-full border border-dashed border-border-strong bg-surface ps-1.5 pe-3.5 text-[0.8125rem] text-fg-muted transition-colors hover:border-accent hover:text-fg"
                >
                  <CollectionIcon icon={s.icon} color={s.color} size="sm" className="rounded-full" />
                  {i18n.language === "ar" ? s.ar : s.en}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
