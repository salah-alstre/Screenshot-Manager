import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Download, FolderClosed, Hash, Images, PencilLine, Search, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/feedback";
import { CaptureButton } from "@/features/capture/CaptureButton";
import { CollectionIcon } from "@/features/collections/icons";
import { LibraryView } from "@/features/library/LibraryView";
import { useActions } from "@/hooks/useActions";
import { useCollections, useTags } from "@/hooks/useData";
import { useSettings } from "@/hooks/useSettings";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { useUi } from "@/stores/ui";
import type { ListQuery } from "@/types/models";
import { colorHex, softBg } from "@/utils/colors";

function PageIcon({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent [&>svg]:size-5"
      style={color ? { background: softBg(color, 18), color: colorHex(color) } : undefined}
    >
      {children}
    </span>
  );
}

export function LibraryScopePage({ scope }: { scope: "all" | "recent" | "favorites" | "uncategorized" }) {
  const { t } = useTranslation();
  // Recent = added in the last 7 days; computed once per visit.
  const baseQuery = useMemo<ListQuery>(
    () => (scope === "recent" ? { scope, recentSince: Date.now() - 7 * 86_400_000 } : { scope }),
    [scope],
  );
  const icons = { all: <Images />, recent: <Clock />, favorites: <Star />, uncategorized: <FolderClosed /> };
  const empty = {
    all: { title: t("library.empty.allTitle"), description: t("library.empty.allDesc"), action: <CaptureButton /> },
    recent: { title: t("library.empty.recentTitle"), description: t("library.empty.recentDesc"), action: <CaptureButton /> },
    favorites: { title: t("library.empty.favoritesTitle"), description: t("library.empty.favoritesDesc") },
    uncategorized: { title: t("library.empty.allTitle"), description: t("library.empty.allDesc") },
  }[scope];
  return (
    <LibraryView
      key={scope}
      listKey={`library:${scope}`}
      baseQuery={baseQuery}
      title={t(`library.scope.${scope}`)}
      icon={<PageIcon>{icons[scope]}</PageIcon>}
      hideFavoriteFilter={scope === "favorites"}
      empty={{ icon: icons[scope], ...empty }}
    />
  );
}

export function SearchPage({ query }: { query: string }) {
  const { t } = useTranslation();
  const baseQuery = useMemo<ListQuery>(() => ({ scope: "all", search: query }), [query]);
  return (
    <LibraryView
      listKey={`search:${query}`}
      baseQuery={baseQuery}
      title={t("library.searchFor", { query })}
      icon={
        <PageIcon>
          <Search />
        </PageIcon>
      }
      empty={{ icon: <Search />, title: t("library.empty.searchTitle"), description: t("library.empty.searchDesc") }}
    />
  );
}

export function CollectionPage({ id }: { id: number }) {
  const { t } = useTranslation();
  const { byId, isLoading } = useCollections();
  const actions = useActions();
  const openDialog = useUi((s) => s.openDialog);
  const navigate = useUi((s) => s.navigate);
  const c = byId.get(id);
  const baseQuery = useMemo<ListQuery>(() => ({ scope: "collection", collectionId: id }), [id]);
  if (!c) {
    return isLoading ? null : (
      <EmptyState icon={<FolderClosed />} title={t("errors.not_found")} action={<Button onClick={() => navigate({ page: "collections" })}>{t("nav.collections")}</Button>} />
    );
  }
  return (
    <LibraryView
      key={id}
      listKey={`collection:${id}`}
      baseQuery={baseQuery}
      title={c.name}
      icon={<CollectionIcon icon={c.icon} color={c.color} size="lg" />}
      hideCollectionFilter
      headerActions={
        <>
          <Button icon={<PencilLine className="size-4" />} onClick={() => openDialog("collection", { collection: c })}>
            <span className="hidden lg:inline">{t("common.edit")}</span>
          </Button>
          <Button icon={<Download className="size-4" />} disabled={!c.count} onClick={() => actions.exportCollection(c.id)}>
            <span className="hidden lg:inline">{t("collections.exportAll")}</span>
          </Button>
        </>
      }
      empty={{ icon: <FolderClosed />, title: t("library.empty.collectionTitle"), description: t("library.empty.collectionDesc") }}
    />
  );
}

export function TagPage({ id }: { id: number }) {
  const { t } = useTranslation();
  const { byId, isLoading } = useTags();
  const openDialog = useUi((s) => s.openDialog);
  const tag = byId.get(id);
  const baseQuery = useMemo<ListQuery>(() => ({ scope: "tag", tagId: id }), [id]);
  if (!tag) return isLoading ? null : <EmptyState icon={<Hash />} title={t("errors.not_found")} />;
  return (
    <LibraryView
      key={id}
      listKey={`tag:${id}`}
      baseQuery={baseQuery}
      title={<span dir="auto">#{tag.name}</span>}
      icon={
        <PageIcon color={tag.color}>
          <Hash />
        </PageIcon>
      }
      headerActions={
        <Button icon={<PencilLine className="size-4" />} onClick={() => openDialog("tag", { tag })}>
          <span className="hidden lg:inline">{t("common.edit")}</span>
        </Button>
      }
      empty={{ icon: <Hash />, title: t("library.empty.tagTitle"), description: t("library.empty.tagDesc") }}
    />
  );
}

export function TrashPage() {
  const { t } = useTranslation();
  const settings = useSettings();
  const actions = useActions();
  const navigate = useUi((s) => s.navigate);
  const baseQuery = useMemo<ListQuery>(() => ({ scope: "trash" }), []);
  const { data: status } = useQuery({ queryKey: ["shots", "trashCount"], queryFn: () => api.listScreenshots({ scope: "trash", limit: 1 }) });
  const count = status?.total ?? 0;
  const days = settings.trashAutoDeleteDays;
  return (
    <LibraryView
      listKey="trash"
      baseQuery={baseQuery}
      inTrash
      title={t("trash.title")}
      subtitle={t("trash.subtitle")}
      icon={
        <PageIcon>
          <Trash2 />
        </PageIcon>
      }
      headerActions={
        <Button variant="danger" icon={<Trash2 className="size-4" />} disabled={!count} onClick={() => void actions.emptyTrash(count)}>
          {t("trash.empty")}
        </Button>
      }
      banner={
        <div className="mx-6 mb-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/60 px-4 py-2.5 text-xs text-fg-muted">
          <span>{days ? t("trash.autoNotice", { days }) : t("trash.neverNotice")}</span>
          <button type="button" className="font-medium text-accent hover:underline" onClick={() => navigate({ page: "settings", section: "storage" })}>
            {t("trash.changeSetting")}
          </button>
        </div>
      }
      empty={{ icon: <Trash2 />, title: t("library.empty.trashTitle"), description: t("library.empty.trashDesc") }}
    />
  );
}
