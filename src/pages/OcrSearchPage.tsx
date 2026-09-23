import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScanText, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState, ProgressBar, Skeleton } from "@/components/ui/feedback";
import { Thumb } from "@/features/library/Thumb";
import { useActions } from "@/hooks/useActions";
import { useDebounced } from "@/hooks/useDebounced";
import { useSettings } from "@/hooks/useSettings";
import { api } from "@/services/api";
import type { ListQuery } from "@/types/models";
import { formatDateTime, formatNumber } from "@/utils/format";
import { highlightTerms, segment, snippet } from "@/utils/normalize";

const LIMIT = 60;

function Snippet({ text, terms }: { text: string; terms: string[] }) {
  const s = useMemo(() => snippet(text, terms), [text, terms]);
  return (
    <p dir="auto" className="line-clamp-3 text-[0.8125rem] leading-relaxed text-fg-muted">
      {segment(s.text, s.ranges).map((p, i) =>
        p.hit ? (
          <mark key={i} className="hl text-fg">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}

export function OcrSearchPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const settings = useSettings();
  const actions = useActions();
  const [input, setInput] = useState("");
  const [limit, setLimit] = useState(LIMIT);
  const q = useDebounced(input.trim(), 250);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setLimit(LIMIT), [q]);

  const query: ListQuery = useMemo(() => ({ scope: "all", search: q, ocr: "with", limit }), [q, limit]);
  const results = useQuery({
    queryKey: ["ocrHits", query],
    queryFn: () => api.searchOcr(query),
    enabled: !!q,
    placeholderData: keepPreviousData,
  });
  const { data: stats } = useQuery({
    queryKey: ["dashboard", "ocrStats"],
    queryFn: () => api.dashboardStats(Date.now(), Date.now()),
  });
  const terms = useMemo(() => highlightTerms(q), [q]);
  const indexed = stats?.ocrIndexed ?? 0;
  const total = stats?.total ?? 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-6">
        <header className="mb-5 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <ScanText className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.01em] text-fg">{t("ocrSearch.title")}</h1>
            <p className="mt-0.5 text-[0.8125rem] text-fg-muted">{t("ocrSearch.subtitle")}</p>
          </div>
        </header>

        <div className="relative">
          <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-fg-subtle" />
          <input
            ref={inputRef}
            value={input}
            dir="auto"
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("ocrSearch.placeholder")}
            aria-label={t("ocrSearch.placeholder")}
            className="h-13 w-full rounded-2xl border border-border bg-surface ps-12 pe-4 text-[0.9375rem] text-fg shadow-card placeholder:text-fg-subtle focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]"
          />
        </div>
        <p className="mt-2 px-1 text-xs text-fg-subtle">{t("ocrSearch.tips")}</p>

        {total > 0 ? (
          <div className="mt-4 flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3 shadow-soft">
            <div className="flex-1">
              <p className="text-xs text-fg-muted">{t("ocrSearch.indexed", { indexed: formatNumber(indexed, lang), total: formatNumber(total, lang) })}</p>
              <ProgressBar value={total ? indexed / total : 0} className="mt-2" />
            </div>
            {stats && stats.ocrPending > 0 && settings.ocrEnabled ? (
              <Button size="sm" icon={<ScanText className="size-3.5" />} onClick={() => void actions.runOcrPending()}>
                {t("ocrSearch.processNow")}
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6">
          {!q ? (
            <EmptyState icon={<ScanText />} title={t("ocrSearch.startTitle")} description={t("ocrSearch.startDesc")} />
          ) : results.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : !results.data?.total ? (
            <EmptyState icon={<SearchX />} title={t("library.empty.searchTitle")} description={t("library.empty.searchDesc")} />
          ) : (
            <>
              <p className="mb-3 text-xs font-medium text-fg-muted">{t("ocrSearch.results", { count: results.data.total })}</p>
              <ul className="flex flex-col gap-2">
                {results.data.items.map((hit, i) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onClick={() => actions.open(hit.id, { scope: "all", search: q, ocr: "with" }, i, q)}
                      className="flex w-full gap-4 rounded-xl border border-border bg-surface p-3 text-start shadow-soft transition-all hover:border-border-strong hover:shadow-card"
                    >
                      <Thumb id={hit.id} version={hit.imageVersion} alt={hit.name} className="h-20 w-32 shrink-0 rounded-lg border border-border" />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-baseline justify-between gap-3">
                          <p className="truncate text-[0.8125rem] font-semibold text-fg">{hit.name}</p>
                          <span className="shrink-0 text-[0.6875rem] text-fg-subtle">{formatDateTime(hit.capturedAt, lang)}</span>
                        </div>
                        <Snippet text={hit.ocrText} terms={terms} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {results.data.total > results.data.items.length ? (
                <div className="mt-4 flex justify-center">
                  <Button onClick={() => setLimit((l) => l + LIMIT)} loading={results.isFetching}>
                    {t("common.loadMore")}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
