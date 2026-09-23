import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/services/api";
import { errorMessage, isCancelled } from "@/services/errors";
import { invalidateLibrary } from "@/services/queryClient";
import { confirm, useUi } from "@/stores/ui";
import { toast } from "@/stores/toast";
import { useSelection } from "@/stores/selection";
import type { ImportReport, ListQuery } from "@/types/models";
import { useCollections } from "./useData";

/**
 * Screenshot operations shared by cards, context menus, bulk actions, the
 * viewer and the command palette, so feedback (toasts, undo, confirmations)
 * is consistent everywhere.
 */
export function useActions() {
  const { t } = useTranslation();
  const { byId: collections } = useCollections();

  return useMemo(() => {
    async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
      try {
        const r = await fn();
        invalidateLibrary();
        return r;
      } catch (e) {
        if (!isCancelled(e)) toast.error(errorMessage(t, e));
        return undefined;
      }
    }

    const reportImport = (r: ImportReport | undefined) => {
      if (!r) return;
      if (r.imported > 0) toast.success(t("toast.imported", { count: r.imported }));
      if (r.duplicates > 0) {
        if (r.imported === 0 && r.failed === 0) toast.info(t("toast.nothingImported"));
        else toast.info(t("toast.duplicatesSkipped", { count: r.duplicates }));
      }
      if (r.failed > 0) toast.error(t("toast.importFailed", { count: r.failed }));
    };

    return {
      open(id: number, query: ListQuery | null = null, index = 0, highlight?: string) {
        useUi.getState().openViewer({ id, query, index, highlight, tab: highlight ? "text" : undefined });
      },
      edit(id: number) {
        useUi.getState().openEditor(id);
      },
      async copy(id: number) {
        const ok = await run(() => api.copyImage(id));
        if (ok !== undefined) toast.success(t("toast.copied"));
      },
      async setFavorite(ids: number[], favorite: boolean) {
        const n = await run(() => api.setFavorite(ids, favorite));
        if (n !== undefined) toast.success(t(favorite ? "toast.favorited" : "toast.unfavorited", { count: ids.length }));
      },
      async trash(ids: number[]) {
        if (!ids.length) return;
        const n = await run(() => api.trash(ids));
        if (n === undefined) return;
        useSelection.getState().clear();
        toast.success(t("toast.trashed", { count: ids.length }), {
          label: t("toast.undo"),
          run: () => void run(() => api.restore(ids)),
        });
      },
      async restore(ids: number[]) {
        const n = await run(() => api.restore(ids));
        if (n !== undefined) {
          useSelection.getState().clear();
          toast.success(t("trash.restored", { count: ids.length }));
        }
      },
      async deletePermanently(ids: number[]) {
        const ok = await confirm({
          title: t("trash.deleteTitle", { count: ids.length }),
          description: t("trash.deleteDesc"),
          confirmLabel: t("common.deletePermanently"),
          danger: true,
        });
        if (!ok) return;
        const n = await run(() => api.deletePermanently(ids));
        if (n !== undefined) {
          useSelection.getState().clear();
          toast.success(t("trash.deleted", { count: n }));
        }
      },
      async emptyTrash(count: number) {
        const ok = await confirm({
          title: t("trash.emptyTitle"),
          description: t("trash.emptyDesc", { count }),
          confirmLabel: t("trash.empty"),
          danger: true,
        });
        if (!ok) return;
        const n = await run(() => api.emptyTrash());
        if (n !== undefined) toast.success(t("trash.deleted", { count: n }));
      },
      async moveToCollection(ids: number[], collectionId: number | null) {
        const n = await run(() => api.moveToCollection(ids, collectionId));
        if (n === undefined) return;
        if (collectionId === null) toast.success(t("toast.removedFromCollection"));
        else toast.success(t("toast.moved", { count: ids.length, name: collections.get(collectionId)?.name ?? "" }));
      },
      async addTag(ids: number[], tagId: number, name: string) {
        const n = await run(() => api.addTag(ids, tagId));
        if (n !== undefined) toast.success(t("toast.tagged", { count: ids.length, name }));
      },
      async addTagByName(ids: number[], name: string, color = "blue") {
        const tag = await run(() => api.addTagByName(ids, name, color));
        if (tag) toast.success(t("toast.tagged", { count: ids.length, name: tag.name }));
        return tag;
      },
      async removeTag(ids: number[], tagId: number, name: string) {
        const n = await run(() => api.removeTag(ids, tagId));
        if (n !== undefined) toast.success(t("toast.untagged", { name }));
      },
      async runOcr(ids: number[]) {
        const n = await run(() => api.runOcr(ids));
        if (n !== undefined) toast.info(t("toast.ocrQueued", { count: n }));
      },
      async runOcrPending() {
        const n = await run(() => api.runOcrPending());
        if (n !== undefined && n > 0) toast.info(t("toast.ocrQueued", { count: n }));
      },
      exportMany(ids: number[]) {
        useUi.getState().openDialog("export", { ids });
      },
      exportCollection(collectionId: number) {
        useUi.getState().openDialog("export", { ids: [], collectionId });
      },
      async openLocation(id: number) {
        await run(() => api.openFileLocation(id));
      },
      rename(id: number, name: string) {
        useUi.getState().openDialog("rename", { id, name });
      },
      async importFiles() {
        reportImport(await run(() => api.importDialog()));
      },
      reportImport,
      async capture(kind: Parameters<typeof api.startCapture>[0], monitor?: number) {
        await run(() => api.startCapture(kind, monitor));
      },
    };
  }, [t, collections]);
}

export type Actions = ReturnType<typeof useActions>;
