import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import type { Collection, Tag } from "@/types/models";

export function useCollections() {
  const q = useQuery({ queryKey: ["collections"], queryFn: api.listCollections });
  const byId = useMemo(() => new Map<number, Collection>((q.data ?? []).map((c) => [c.id, c])), [q.data]);
  return { collections: q.data ?? [], byId, isLoading: q.isLoading };
}

export function useTags() {
  const q = useQuery({ queryKey: ["tags"], queryFn: api.listTags });
  const byId = useMemo(() => new Map<number, Tag>((q.data ?? []).map((t) => [t.id, t])), [q.data]);
  return { tags: q.data ?? [], byId, isLoading: q.isLoading };
}

export function useScreenshot(id: number | null | undefined) {
  return useQuery({
    queryKey: ["shot", id],
    queryFn: () => api.getScreenshot(id as number),
    enabled: typeof id === "number",
  });
}

export function useStatus() {
  return useQuery({ queryKey: ["status"], queryFn: api.statusInfo, refetchInterval: 60_000 });
}

export function useAppInfo() {
  return useQuery({ queryKey: ["appInfo"], queryFn: api.appInfo, staleTime: Infinity });
}

export function useOcrLanguages() {
  return useQuery({ queryKey: ["ocrLanguages"], queryFn: api.ocrLanguages, staleTime: Infinity });
}
