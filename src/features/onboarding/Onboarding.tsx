import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, FolderOpen, ScanText, ShieldCheck } from "lucide-react";
import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { Switch } from "@/components/ui/controls";
import { WindowControls } from "@/components/layout/WindowControls";
import { ShortcutRecorder } from "@/features/settings/ShortcutRecorder";
import { useAppInfo, useOcrLanguages } from "@/hooks/useData";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { api } from "@/services/api";
import { errorMessage, isCancelled } from "@/services/errors";
import { toast } from "@/stores/toast";
import { cn } from "@/utils/cn";

const STEPS = 6;

function StepShell({ icon, title, description, children }: { icon?: ReactNode; title: string; description?: string; children?: ReactNode }) {
  return (
    <div key={title} className="flex animate-slide-up flex-col items-center text-center">
      {icon ? <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent [&>svg]:size-6">{icon}</div> : null}
      <h1 className="text-2xl font-semibold tracking-[-0.015em] text-fg">{title}</h1>
      {description ? <p className="mt-2 max-w-md text-[0.875rem] leading-relaxed text-fg-muted">{description}</p> : null}
      {children ? <div className="mt-8 w-full">{children}</div> : null}
    </div>
  );
}

export function Onboarding() {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();
  const [step, setStep] = useState(0);
  const { data: info, refetch: refetchInfo } = useAppInfo();
  const { data: langs } = useOcrLanguages();
  const suggested = useQuery({ queryKey: ["watched", "suggested"], queryFn: api.suggestedWatchFolder });
  const [watchSuggested, setWatchSuggested] = useState(true);

  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const finish = async () => {
    if (suggested.data && watchSuggested) {
      try {
        await api.addSuggestedWatchFolder();
      } catch (e) {
        toast.error(errorMessage(t, e));
      }
    }
    await update({ onboardingCompleted: true });
  };

  const chooseFolder = async () => {
    try {
      await api.chooseLibraryRoot();
      await refetchInfo();
    } catch (e) {
      if (!isCancelled(e)) toast.error(errorMessage(t, e));
    }
  };

  const content = [
    <StepShell key="welcome" title={t("onboarding.welcomeTitle")} description={t("onboarding.welcomeDesc")}>
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="absolute inset-0 scale-150 rounded-full bg-accent opacity-25 blur-3xl" />
          <LogoMark className="relative size-24 drop-shadow-2xl" />
        </div>
        <Wordmark className="text-3xl" />
      </div>
    </StepShell>,
    <StepShell key="lang" title={t("onboarding.languageTitle")} description={t("onboarding.languageDesc")}>
      <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
        {(["en", "ar"] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => void update({ language: l })}
            className={cn(
              "flex flex-col items-center gap-2 rounded-2xl border p-5 transition-all",
              settings.language === l ? "border-accent bg-accent-soft shadow-[0_0_0_1px_var(--accent)]" : "border-border bg-surface hover:border-border-strong",
            )}
          >
            <span lang={l} className="text-2xl font-semibold text-fg">
              {l === "ar" ? "العربية" : "English"}
            </span>
            <span className="text-xs text-fg-subtle">{l === "ar" ? "من اليمين إلى اليسار" : "Left to right"}</span>
          </button>
        ))}
      </div>
    </StepShell>,
    <StepShell key="folder" icon={<FolderOpen />} title={t("onboarding.folderTitle")} description={t("onboarding.folderDesc")}>
      <div className="mx-auto flex max-w-lg flex-col gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2 shadow-soft">
          <span dir="ltr" className="min-w-0 flex-1 truncate px-2 text-start font-mono text-xs text-fg">
            {info?.libraryRoot}
          </span>
          <Button size="sm" onClick={() => void chooseFolder()}>
            {t("common.change")}
          </Button>
        </div>
        {suggested.data ? (
          <label className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3 text-start shadow-soft">
            <Switch checked={watchSuggested} onChange={setWatchSuggested} label={t("onboarding.watchSuggestion")} />
            <span>
              <span className="block text-[0.8125rem] font-medium text-fg">{t("onboarding.watchSuggestion")}</span>
              <span className="mt-0.5 block text-xs text-fg-muted">{t("onboarding.watchSuggestionDesc")}</span>
            </span>
          </label>
        ) : null}
      </div>
    </StepShell>,
    <StepShell key="shortcut" title={t("onboarding.shortcutTitle")} description={t("onboarding.shortcutDesc")}>
      <div className="flex justify-center">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
          <ShortcutRecorder global value={settings.hotkeys.region} onChange={(v) => void update({ hotkeys: { region: v } })} label={t("settings.shortcuts.region")} />
        </div>
      </div>
    </StepShell>,
    <StepShell key="ocr" icon={<ScanText />} title={t("onboarding.ocrTitle")} description={t("onboarding.ocrDesc")}>
      <div className="mx-auto flex max-w-md flex-col gap-3">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-start shadow-soft">
          <span className="text-[0.8125rem] font-medium text-fg">{t("onboarding.ocrEnable")}</span>
          <Switch checked={settings.ocrEnabled && settings.autoOcr} onChange={(v) => void update({ ocrEnabled: v || settings.ocrEnabled, autoOcr: v })} label={t("onboarding.ocrEnable")} />
        </label>
        {langs?.installed.length ? (
          <p className="text-xs text-fg-subtle">{t("settings.ocr.installed", { langs: langs.installed.join(", ") })}</p>
        ) : null}
        <p className="flex items-center justify-center gap-1.5 text-xs text-success">
          <ShieldCheck className="size-3.5" />
          {t("settings.privacy.points.localOcr")}
        </p>
      </div>
    </StepShell>,
    <StepShell key="ready" icon={<Check />} title={t("onboarding.readyTitle")}>
      <div className="flex flex-col items-center gap-3">
        <p className="max-w-md text-[0.875rem] leading-relaxed text-fg-muted">{t("onboarding.readyDesc", { shortcut: settings.hotkeys.region || "—" })}</p>
        {settings.hotkeys.region ? <Kbd keys={settings.hotkeys.region} /> : null}
      </div>
    </StepShell>,
  ];

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="drag-region flex h-12 shrink-0 items-center justify-end">
        <WindowControls className="h-12" />
      </div>
      <div className="pointer-events-none fixed top-1/4 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-accent opacity-[0.06] blur-3xl" />
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6">
        <div className="relative w-full max-w-2xl">{content[step]}</div>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-4 px-8 pt-4 pb-8">
        <div className="w-32">
          {step > 0 ? (
            <Button variant="ghost" icon={<ArrowLeft className="flip-rtl size-4" />} onClick={back}>
              {t("common.back")}
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5" aria-label={t("onboarding.step", { current: step + 1, total: STEPS })}>
          {Array.from({ length: STEPS }).map((_, i) => (
            <span key={i} className={cn("h-1.5 rounded-full transition-all duration-300", i === step ? "w-6 bg-accent" : i < step ? "w-1.5 bg-accent/50" : "w-1.5 bg-border-strong")} />
          ))}
        </div>
        <div className="flex w-32 justify-end">
          {step < STEPS - 1 ? (
            <Button variant="primary" iconEnd={<ArrowRight className="flip-rtl size-4" />} onClick={next}>
              {step === 0 ? t("onboarding.getStarted") : t("common.next")}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void finish()}>
              {t("onboarding.finish")}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
