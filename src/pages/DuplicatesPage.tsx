import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, CopyCheck, Eye, EyeOff, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Thumb } from "@/features/library/Thumb";
import { useActions } from "@/hooks/useActions";
import { api } from "@/services/api";
import { errorMessage } from "@/services/errors";
import { imageUrl } from "@/services/urls";
import { toast } from "@/stores/toast";
import type { DuplicateGroup, DuplicateReport, ScreenshotSummary } from "@/types/models";
import { formatBytes, formatDateTime, formatDimensions } from "@/utils/format";

function oldestFirst(items: ScreenshotSummary[]) {
  return [...items].sort((a, b) => a.capturedAt - b.capturedAt || a.id - b.id);
}

function GroupCard({ group, onResolved }: { group: DuplicateGroup; onResolved: (key: string) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const actions = useActions();
  const [compare, setCompare] = useState(false);
  const items = oldestFirst(group.items);
  const ids = items.map((s) => s.id);

  const keepOnly = async (keepId: number) => {
    await actions.trash(ids.filter((i) => i !== keepId));
    onResolved(group.key);
  };
  const keepAll = async () => {
    try {
      await api.ignoreDuplicates(ids);
      toast.success(t("duplicates.resolved"));
      onResolved(group.key);
    } catch (e) {
      toast.error(errorMessage(t, e));
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="flex-1 text-[0.8125rem] font-semibold text-fg">
          {group.kind === "exact" ? t("duplicates.groupExact", { count: items.length }) : t("duplicates.groupSimilar", { count: items.length })}
        </p>
        <Button size="sm" variant="ghost" icon={<Eye className="size-3.5" />} onClick={() => setCompare(true)}>
          {t("duplicates.viewBoth")}
        </Button>
        <Button size="sm" icon={<Check className="size-3.5" />} onClick={() => void keepAll()}>
          {t("duplicates.keepBoth")}
        </Button>
        <Button size="sm" variant="ghost" icon={<EyeOff className="size-3.5" />} onClick={() => onResolved(group.key)}>
          {t("duplicates.ignore")}
        </Button>
        <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} title={t("duplicates.deleteDuplicateDesc")} onClick={() => void keepOnly(items[0]!.id)}>
          {t("duplicates.deleteDuplicate")}
        </Button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3">
        {items.map((s, i) => (
          <div key={s.id} className="group overflow-hidden rounded-xl border border-border bg-surface-2">
            <button type="button" className="relative block w-full" onClick={() => actions.open(s.id, null, 0)} aria-label={s.name}>
              <Thumb id={s.id} version={s.imageVersion} alt={s.name} className="aspect-[16/10]" />
              {i === 0 ? (
                <span className="absolute start-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[0.625rem] font-medium text-white">{t("duplicates.oldest")}</span>
              ) : null}
            </button>
            <div className="p-2.5">
              <p className="truncate text-xs font-medium text-fg">{s.name}</p>
              <p className="mt-0.5 truncate text-[0.6875rem] text-fg-subtle">
                {formatDateTime(s.capturedAt, lang)} · <span dir="ltr">{formatDimensions(t, s.width, s.height, lang)}</span> · {formatBytes(t, s.fileSize, lang)}
              </p>
              <Button size="sm" variant="subtle" className="mt-2 w-full" onClick={() => void keepOnly(s.id)}>
                {t("duplicates.keepThis")}
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={compare} onOpenChange={setCompare} title={t("duplicates.compareTitle")} width="xl">
        <div className="grid grid-cols-2 gap-3">
          {items.slice(0, 2).map((s) => (
            <figure key={s.id} className="flex flex-col gap-2">
              <div className="checkerboard flex h-[55vh] items-center justify-center overflow-hidden rounded-xl border border-border">
                <img src={imageUrl(s.id, s.imageVersion)} alt={s.name} className="max-h-full max-w-full object-contain" />
              </div>
              <figcaption className="truncate text-xs text-fg-muted">
                {s.name} · <span dir="ltr">{formatDimensions(t, s.width, s.height, lang)}</span> · {formatBytes(t, s.fileSize, lang)}
              </figcaption>
            </figure>
          ))}
        </div>
      </Dialog>
    </section>
  );
}

export function DuplicatesPage() {
  const { t } = useTranslation();
  const [report, setReport] = useState<DuplicateReport | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState("exact");
  const scan = useMutation({
    mutationFn: api.scanDuplicates,
    onSuccess: (r) => {
      setReport(r);
      setHidden(new Set());
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  // Scan on first visit.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    scan.mutate();
  }, [scan]);

  const exact = useMemo(() => report?.exact.filter((g) => !hidden.has(g.key)) ?? [], [report, hidden]);
  const similar = useMemo(() => report?.similar.filter((g) => !hidden.has(g.key)) ?? [], [report, hidden]);
  const resolve = (key: string) => setHidden((h) => new Set(h).add(key));

  const list = (groups: DuplicateGroup[], emptyTitle: string, emptyDesc: string) =>
    scan.isPending && !report ? (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-60 rounded-2xl" />
        ))}
      </div>
    ) : groups.length ? (
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <GroupCard key={g.key} group={g} onResolved={resolve} />
        ))}
      </div>
    ) : (
      <EmptyState icon={<CopyCheck />} title={emptyTitle} description={emptyDesc} />
    );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-5">
        <header className="mb-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <CopyCheck className="size-5" />
          </span>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-[-0.01em] text-fg">{t("duplicates.title")}</h1>
            <p className="mt-0.5 text-[0.8125rem] text-fg-muted">{t("duplicates.subtitle")}</p>
          </div>
          <Button icon={<RefreshCw className={scan.isPending ? "size-4 animate-spin" : "size-4"} />} disabled={scan.isPending} onClick={() => scan.mutate()}>
            {scan.isPending ? t("duplicates.scanning") : t("duplicates.scan")}
          </Button>
        </header>
        <Tabs.Root value={tab} onValueChange={setTab}>
          <Tabs.List className="mb-5 px-0">
            <Tabs.Trigger value="exact">
              {t("duplicates.exact")}
              {report ? <span className="rounded-full bg-surface-3 px-1.5 text-[0.6875rem] text-fg-muted">{exact.length}</span> : null}
            </Tabs.Trigger>
            <Tabs.Trigger value="similar">
              {t("duplicates.similar")}
              {report ? <span className="rounded-full bg-surface-3 px-1.5 text-[0.6875rem] text-fg-muted">{similar.length}</span> : null}
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="exact">{list(exact, t("duplicates.noneTitle"), t("duplicates.noneDesc"))}</Tabs.Content>
          <Tabs.Content value="similar">{list(similar, t("duplicates.noneSimilarTitle"), t("duplicates.noneSimilarDesc"))}</Tabs.Content>
        </Tabs.Root>
      </div>
    </div>
  );
}
