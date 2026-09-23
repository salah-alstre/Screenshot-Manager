import { useEffect } from "react";
import { Direction } from "radix-ui";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { Toaster } from "@/components/ui/Toaster";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { Onboarding } from "@/features/onboarding/Onboarding";
import { useApplySettings } from "@/hooks/useAppEffects";
import { useSettingsQuery } from "@/hooks/useSettings";
import { dirFor } from "@/i18n";
import { api } from "@/services/api";

export function App() {
  const { data: settings, isError, refetch } = useSettingsQuery();
  const { i18n, t } = useTranslation();
  useApplySettings(settings);

  // Show the window only once the first real frame is ready (no white flash).
  useEffect(() => {
    if (settings) requestAnimationFrame(() => void api.appReady());
  }, [settings]);

  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-fg">
        <p>{t("errors.loadFailed")}</p>
        <button type="button" className="text-accent" onClick={() => void refetch()}>
          {t("common.retry")}
        </button>
      </div>
    );
  }
  if (!settings) return <div className="h-full bg-bg" />;

  return (
    <Direction.Provider dir={dirFor(i18n.language)}>
      <TooltipProvider delayDuration={350}>
        {settings.onboardingCompleted ? <AppShell /> : <Onboarding />}
        <Toaster />
      </TooltipProvider>
    </Direction.Provider>
  );
}
