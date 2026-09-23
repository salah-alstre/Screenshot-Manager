import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowRight, CopyCheck, FolderOpen, HardDrive, Images, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select, Switch } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/feedback";
import { CollectionIcon } from "@/features/collections/icons";
import { Thumb } from "@/features/library/Thumb";
import { useActions } from "@/hooks/useActions";
import { useAppInfo, useCollections } from "@/hooks/useData";
import { api } from "@/services/api";
import { errorMessage } from "@/services/errors";
import { invalidateLibrary } from "@/services/queryClient";
import { toast } from "@/stores/toast";
import { confirm, useUi } from "@/stores/ui";
import type { ScreenshotSummary } from "@/types/models";
import { formatBytes, formatDate, formatMonth, formatNumber } from "@/utils/format";

function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[0.8125rem] font-semibold text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent [&>svg]:size-5">{icon}</span>
      <div>
        <p className="text-lg font-semibold text-fg tabular-nums">{value}</p>
        <p className="text-xs text-fg-muted">{label}</p>
      </div>
    </div>
  );
}

function FileList({ items, meta }: { items: ScreenshotSummary[]; meta: (s: ScreenshotSummary) => string }) {
  const actions = useActions();
  return (
    <ul className="flex flex-col gap-1">
      {items.map((s, i) => (
        <li key={s.id}>
          <button type="button" onClick={() => actions.open(s.id, null, i)} className="flex w-full items-center gap-3 rounded-lg p-1.5 text-start hover:bg-surface-2">
            <Thumb id={s.id} version={s.imageVersion} alt={s.name} className="h-9 w-14 shrink-0 rounded-md border border-border" />
            <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-fg">{s.name}</span>
            <span className="shrink-0 text-xs text-fg-subtle tabular-nums">{meta(s)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const PERIODS = [30, 90, 180, 365, 730];

export function StoragePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useUi((s) => s.navigate);
  const { byId } = useCollections();
  const { data: info } = useAppInfo();
  const { data, isLoading } = useQuery({ queryKey: ["storage"], queryFn: api.storageStats });
  const [days, setDays] = useState(365);
  const [favorites, setFavorites] = useState(false);
  const preview = useQuery({ queryKey: ["storage", "cleanup", days, favorites], queryFn: () => api.cleanupPreview(days, favorites) });

  const periodLabel = (d: number) => (d >= 365 ? t("storage.cleanup.years", { count: d / 365 }) : t("storage.cleanup.months", { count: Math.round(d / 30) }));

  const cleanup = async () => {
    const count = preview.data?.count ?? 0;
    if (!count) return;
    const ok = await confirm({ title: t("storage.cleanup.confirmTitle", { count }), description: t("storage.cleanup.confirmDesc"), confirmLabel: t("storage.cleanup.action") });
    if (!ok) return;
    try {
      const n = await api.cleanupOld(days, favorites);
      invalidateLibrary(true);
      toast.success(t("toast.trashed", { count: n }));
    } catch (e) {
      toast.error(errorMessage(t, e));
    }
  };

  const maxMonth = Math.max(1, ...(data?.perMonth.map((b) => b.bytes) ?? [1]));
  const maxCol = Math.max(1, ...(data?.perCollection.map((b) => b.bytes) ?? [1]));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-5">
        <header className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <HardDrive className="size-5" />
          </span>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-[-0.01em] text-fg">{t("storage.title")}</h1>
            <p className="mt-0.5 text-[0.8125rem] text-fg-muted">{t("storage.subtitle")}</p>
          </div>
        </header>

        {isLoading || !data ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat icon={<HardDrive />} label={t("storage.total")} value={formatBytes(t, data.totalBytes, lang)} />
              <Stat icon={<Images />} label={t("storage.count")} value={formatNumber(data.count, lang)} />
              <Stat icon={<Trash2 />} label={t("storage.trash")} value={formatBytes(t, data.trashBytes, lang)} />
              <Stat icon={<Wand2 />} label={t("storage.edited")} value={formatNumber(data.editedCount, lang)} />
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-soft">
              <FolderOpen className="size-4 shrink-0 text-fg-muted" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-fg-muted">{t("storage.location")}</p>
                <p dir="ltr" className="selectable truncate text-start font-mono text-xs text-fg">
                  {info?.libraryRoot}
                </p>
              </div>
              <Button size="sm" onClick={() => void api.openLibraryFolder()}>
                {t("storage.openFolder")}
              </Button>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card title={t("storage.perMonth")}>
                {data.perMonth.length ? (
                  <div className="flex h-44 items-end gap-2" dir="ltr">
                    {data.perMonth.map((b) => (
                      <div key={b.key} className="group flex flex-1 flex-col items-center gap-1.5" title={`${formatBytes(t, b.bytes, lang)} · ${t("format.screenshots", { count: b.count })}`}>
                        <span className="text-[0.625rem] text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100">{formatBytes(t, b.bytes, lang)}</span>
                        <div className="w-full max-w-9 rounded-t-md bg-accent/80 transition-colors group-hover:bg-accent" style={{ height: `${Math.max(4, (b.bytes / maxMonth) * 120)}px` }} />
                        <span className="text-[0.625rem] text-fg-subtle">{formatMonth(b.key, lang)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-fg-subtle">—</p>
                )}
              </Card>

              <Card title={t("storage.perCollection")}>
                <ul className="flex flex-col gap-3">
                  {data.perCollection.map((b) => {
                    const c = b.collectionId ? byId.get(b.collectionId) : undefined;
                    return (
                      <li key={b.collectionId ?? "none"} className="flex items-center gap-3">
                        {c ? <CollectionIcon icon={c.icon} color={c.color} size="sm" /> : <span className="size-6 rounded-md bg-surface-3" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate text-fg">{c?.name ?? t("storage.uncategorized")}</span>
                            <span className="shrink-0 text-fg-subtle tabular-nums">{formatBytes(t, b.bytes, lang)}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${(b.bytes / maxCol) * 100}%` }} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>

              <Card title={t("storage.largest")}>
                <FileList items={data.largest} meta={(s) => formatBytes(t, s.fileSize, lang)} />
              </Card>
              <Card title={t("storage.oldest")}>
                <FileList items={data.oldest} meta={(s) => formatDate(s.capturedAt, lang)} />
              </Card>
            </div>

            <Card title={t("storage.cleanup.title")}>
              <p className="-mt-2 mb-4 text-xs text-fg-muted">{t("storage.cleanup.desc")}</p>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-[0.8125rem] text-fg">
                  {t("storage.cleanup.olderThan")}
                  <Select value={String(days)} onChange={(v) => setDays(Number(v))} label={t("storage.cleanup.olderThan")} options={PERIODS.map((d) => ({ value: String(d), label: periodLabel(d) }))} />
                </label>
                <label className="flex items-center gap-2 text-[0.8125rem] text-fg">
                  <Switch checked={favorites} onChange={setFavorites} label={t("storage.cleanup.includeFavorites")} />
                  {t("storage.cleanup.includeFavorites")}
                </label>
                <span className="text-xs text-fg-muted">
                  {preview.data?.count
                    ? t("storage.cleanup.preview", { count: preview.data.count, size: formatBytes(t, preview.data.bytes, lang) })
                    : t("storage.cleanup.previewNone")}
                </span>
                <Button className="ms-auto" icon={<Trash2 className="size-4" />} disabled={!preview.data?.count} onClick={() => void cleanup()}>
                  {t("storage.cleanup.action")}
                </Button>
              </div>
            </Card>

            <button
              type="button"
              onClick={() => navigate({ page: "duplicates" })}
              className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 text-start shadow-soft transition-all hover:border-border-strong hover:shadow-card"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <CopyCheck className="size-5" />
              </span>
              <span className="flex-1">
                <span className="block text-[0.8125rem] font-semibold text-fg">{t("storage.duplicatesCard")}</span>
                <span className="block text-xs text-fg-muted">{t("storage.duplicatesCardDesc")}</span>
              </span>
              <ArrowRight className="flip-rtl size-4 text-fg-subtle" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
