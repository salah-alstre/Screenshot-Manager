import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/** Query keys whose data depends on library contents. */
export const LIBRARY_KEYS = [
  ["shots"],
  ["shot"],
  ["collections"],
  ["tags"],
  ["dashboard"],
  ["status"],
  ["storage"],
  ["ocrHits"],
  ["ids"],
  ["summaries"],
] as const;

let pending: ReturnType<typeof setTimeout> | null = null;

/** Debounced invalidation of everything derived from the library. */
export function invalidateLibrary(immediate = false) {
  const run = () => {
    pending = null;
    for (const key of LIBRARY_KEYS) void queryClient.invalidateQueries({ queryKey: [...key] });
  };
  if (immediate) {
    if (pending) clearTimeout(pending);
    run();
    return;
  }
  if (pending) return;
  pending = setTimeout(run, 250);
}
