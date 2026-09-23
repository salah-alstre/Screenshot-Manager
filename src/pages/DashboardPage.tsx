import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowRight, CalendarDays, CalendarRange, FolderPlus, HardDrive, Images, ScanText, Sparkles, Star, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { EmptyState, Skeleton, TagChip } from "@/components/ui/feedback";
import { CaptureButton } from "@/features/capture/CaptureButton";
import { CollectionIcon } from "@/features/collections/icons";
import { Thumb } from "@/features/library/Thumb";
import { useActions } from "@/hooks/useActions";
import { useSettings } from "@/hooks/useSettings";
import { api } from "@/services/api";
import { useUi } from "@/stores/ui";
import { formatBytes, formatNumber, formatRelative } from "@/utils/format";
import { startOfDay, startOfWeek } from "@/utils/dates";

function StatCard({ icon, label, value, hint, onClick }: { icon: ReactNode; label: string; value: string; hint?: string; onClick?: () => void }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 text-start shadow-soft transition-all duration-200 hover:border-border-strong hover:shadow-card"
    >
      <div className="flex items-center justify-between">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent [&>svg]:size-4">{icon}</span>
        {hint ? <span className="text-[0.6875rem] text-fg-subtle">{hint}</span> : null}
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight text-fg tabular-nums">{value}</p>
        <p className="mt-0.5 text-xs text-fg-muted">{label}</p>
      </div>
    </Comp>
  );
}

function greeting(t: (k: string) => string): string {
  const h = new Date().getHours();
  if (h < 12) return t("dashboard.greetingMorning");
  if (h < 18) return t("dashboard.greetingAfternoon");
  return t("dashboard.greetingEvening");
}

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const settings = useSettings();
  const actions = useActions();
  const navigate = useUi((s) => s.navigate);
  const openDialog = useUi((s) => s.openDialog);
  const now = new Date();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", startOfDay(now).getTime()],
    queryFn: () => api.dashboardStats(startOfDay(now).getTime(), startOfWeek(now).getTime()),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-8 py-7">
        <header>
          <h1 className="text-2xl font-semibold tracking-[-0.015em] text-fg">{greeting(t)}</h1>
          <p className="mt-1 text-[0.8125rem] text-fg-muted">{t("dashboard.subtitle")}</p>
        </header>

        {/* Hero capture card */}
        <section className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-card">
          <div className="pointer-events-none absolute -end-16 -top-24 size-72 rounded-full bg-accent opacity-[0.13] blur-3xl" />
          <div className="pointer-events-none absolute end-10 -bottom-28 size-56 rounded-full bg-accent opacity-[0.08] blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-md">
              <p className="flex items-center gap-1.5 text-xs font-medium text-accent">
                <Sparkles className="size-3.5" />
                SnapVault
              </p>
              <h2 className="mt-2 text-lg font-semibold text-fg">{t("dashboard.captureCta")}</h2>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-muted">{t("dashboard.captureCtaDesc")}</p>
              <Kbd keys={settings.hotkeys.region} className="mt-3" />
            </div>
            <div className="flex items-center gap-2">
              <Button size="lg" icon={<Upload className="size-4" />} onClick={() => void actions.importFiles()}>
                {t("dashboard.import")}
              </Button>
              <CaptureButton size="lg" />
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {isLoading || !data ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[7.25rem] rounded-2xl" />)
          ) : (
            <>
              <StatCard icon={<Images />} label={t("dashboard.total")} value={formatNumber(data.total, lang)} onClick={() => navigate({ page: "library", scope: "all" })} />
              <StatCard icon={<CalendarDays />} label={t("dashboard.today")} value={formatNumber(data.today, lang)} />
              <StatCard icon={<CalendarRange />} label={t("dashboard.week")} value={formatNumber(data.week, lang)} onClick={() => navigate({ page: "library", scope: "recent" })} />
              <StatCard icon={<Star />} label={t("dashboard.favorites")} value={formatNumber(data.favorites, lang)} onClick={() => navigate({ page: "library", scope: "favorites" })} />
              <StatCard icon={<HardDrive />} label={t("dashboard.storage")} value={formatBytes(t, data.storageBytes, lang)} onClick={() => navigate({ page: "storage" })} />
              <StatCard
                icon={<ScanText />}
                label={t("dashboard.ocrIndexed")}
                value={formatNumber(data.ocrIndexed, lang)}
                hint={data.ocrPending ? t("dashboard.ocrPendingHint", { count: data.ocrPending }) : undefined}
                onClick={() => navigate({ page: "ocr" })}
              />
            </>
          )}
        </section>

        {data && data.total === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong">
            <EmptyState
              icon={<Images />}
              title={t("dashboard.emptyTitle")}
              description={t("dashboard.emptyDesc")}
              action={
                <>
                  <Button icon={<Upload className="size-4" />} onClick={() => void actions.importFiles()}>
                    {t("dashboard.import")}
                  </Button>
                  <CaptureButton />
                </>
              }
            />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[0.9375rem] font-semibold text-fg">{t("dashboard.recent")}</h2>
                <Button variant="ghost" size="sm" iconEnd={<ArrowRight className="flip-rtl size-3.5" />} onClick={() => navigate({ page: "library", scope: "all" })}>
                  {t("dashboard.viewAll")}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {isLoading || !data
                  ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[16/11] rounded-xl" />)
                  : data.recent.map((s, i) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => actions.open(s.id, { scope: "all", sort: "added" }, i)}
                        className="group overflow-hidden rounded-xl border border-border bg-surface text-start shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card"
                      >
                        <Thumb id={s.id} version={s.imageVersion} alt={s.name} className="aspect-[16/10]" />
                        <div className="px-2.5 py-2">
                          <p className="truncate text-xs font-medium text-fg">{s.name}</p>
                          <p className="mt-0.5 text-[0.6875rem] text-fg-subtle">{formatRelative(t, s.importedAt, lang)}</p>
                        </div>
                      </button>
                    ))}
              </div>
            </section>

            <aside className="flex flex-col gap-6">
              <section className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
                <h2 className="mb-3 text-[0.8125rem] font-semibold text-fg">{t("dashboard.topTags")}</h2>
                {data?.topTags.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {data.topTags.map((tag) => (
                      <TagChip key={tag.id} name={tag.name} count={formatNumber(tag.count, lang)} color={tag.color} onClick={() => navigate({ page: "tag", id: tag.id })} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-fg-subtle">{t("dashboard.noTags")}</p>
                )}
              </section>
              <section className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[0.8125rem] font-semibold text-fg">{t("dashboard.recentCollections")}</h2>
                  <Button variant="ghost" size="sm" icon={<FolderPlus className="size-3.5" />} onClick={() => openDialog("collection", {})}>
                    {t("dashboard.newCollection")}
                  </Button>
                </div>
                {data?.recentCollections.length ? (
                  <div className="flex flex-col gap-1">
                    {data.recentCollections.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => navigate({ page: "collection", id: c.id })}
                        className="flex items-center gap-3 rounded-lg p-1.5 text-start transition-colors hover:bg-surface-2"
                      >
                        <CollectionIcon icon={c.icon} color={c.color} size="md" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.8125rem] font-medium text-fg">{c.name}</span>
                          <span className="block text-[0.6875rem] text-fg-subtle">{t("format.screenshots", { count: c.count })}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-fg-subtle">{t("dashboard.noCollections")}</p>
                )}
              </section>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
