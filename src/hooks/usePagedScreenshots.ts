import { useCallback, useMemo } from "react";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import type { ListQuery, Page, ScreenshotSummary } from "@/types/models";

export const PAGE_SIZE = 120;

function stripPaging(q: ListQuery): ListQuery {
  const { offset: _o, limit: _l, ...rest } = q;
  return rest;
}

export function pageQueryKey(query: ListQuery, page: number) {
  return ["shots", stripPaging(query), page] as const;
}

export function fetchPage(query: ListQuery, page: number): Promise<Page<ScreenshotSummary>> {
  return api.listScreenshots({ ...stripPaging(query), offset: page * PAGE_SIZE, limit: PAGE_SIZE });
}

/**
 * Paged access to a (potentially huge) screenshot list. Only the pages that
 * cover `visibleRange` are fetched; the virtualized grid calls `getItem(i)`
 * and renders a skeleton for indexes whose page hasn't loaded yet.
 */
export function usePagedScreenshots(query: ListQuery, visibleRange: [number, number]) {
  const first = useQuery({
    queryKey: pageQueryKey(query, 0),
    queryFn: () => fetchPage(query, 0),
    placeholderData: keepPreviousData,
  });

  const pages = useMemo(() => {
    const [start, end] = visibleRange;
    const from = Math.max(0, Math.floor(start / PAGE_SIZE));
    const to = Math.max(from, Math.floor(Math.max(end, 0) / PAGE_SIZE));
    const list: number[] = [];
    for (let p = from; p <= to; p++) if (p !== 0) list.push(p);
    return list;
  }, [visibleRange]);

  const results = useQueries({
    queries: pages.map((p) => ({
      queryKey: pageQueryKey(query, p),
      queryFn: () => fetchPage(query, p),
      placeholderData: keepPreviousData,
    })),
  });

  const pageMap = useMemo(() => {
    const map = new Map<number, ScreenshotSummary[]>();
    if (first.data) map.set(0, first.data.items);
    results.forEach((r, i) => {
      if (r.data) map.set(pages[i]!, r.data.items);
    });
    return map;
  }, [first.data, results, pages]);

  const total = first.data?.total ?? 0;

  const getItem = useCallback(
    (index: number): ScreenshotSummary | undefined => {
      const page = pageMap.get(Math.floor(index / PAGE_SIZE));
      return page?.[index % PAGE_SIZE];
    },
    [pageMap],
  );

  return {
    total,
    getItem,
    isLoading: first.isLoading,
    isError: first.isError,
    refetch: first.refetch,
    isPlaceholder: first.isPlaceholderData,
  };
}
