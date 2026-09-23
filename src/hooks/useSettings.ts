import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/services/api";
import { errorMessage } from "@/services/errors";
import { toast } from "@/stores/toast";
import type { Settings, SettingsPatch, SettingsUpdate } from "@/types/models";

export const SETTINGS_KEY = ["settings"] as const;

function merge(s: Settings, patch: SettingsPatch): Settings {
  const next = { ...s } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    const cur = next[k];
    next[k] = cur && typeof cur === "object" && v && typeof v === "object" ? { ...cur, ...v } : v;
  }
  return next as unknown as Settings;
}

export function useSettingsQuery() {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: api.getSettings, staleTime: Infinity });
}

/** Current settings (must be loaded — App waits for them before rendering). */
export function useSettings(): Settings {
  const { data } = useSettingsQuery();
  if (!data) throw new Error("settings not loaded");
  return data;
}

/** Optimistically updates settings and persists them. */
export function useUpdateSettings() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const mutation = useMutation<SettingsUpdate, unknown, SettingsPatch, { prev?: Settings }>({
    mutationFn: api.updateSettings,
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: SETTINGS_KEY });
      const prev = qc.getQueryData<Settings>(SETTINGS_KEY);
      if (prev) qc.setQueryData(SETTINGS_KEY, merge(prev, patch));
      return { prev };
    },
    onError: (e, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(SETTINGS_KEY, ctx.prev);
      toast.error(errorMessage(t, e));
    },
    onSuccess: (res) => qc.setQueryData(SETTINGS_KEY, res.settings),
  });
  return useCallback((patch: SettingsPatch) => mutation.mutateAsync(patch), [mutation]);
}
