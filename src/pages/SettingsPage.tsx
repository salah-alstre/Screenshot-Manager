import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Camera, HardDrive, Info, Keyboard, Languages, Palette, ScanText, Settings2, ShieldCheck, Wrench } from "lucide-react";
import {
  AboutSection,
  AdvancedSection,
  AppearanceSection,
  CaptureSection,
  GeneralSection,
  LanguageSection,
  NotificationsSection,
  OcrSection,
  PrivacySection,
  ShortcutsSection,
  StorageSection,
} from "@/features/settings/sections";
import { useUi, type SettingsSection } from "@/stores/ui";
import { cn } from "@/utils/cn";

const SECTIONS: { id: SettingsSection; icon: ReactNode; render: () => ReactNode }[] = [
  { id: "general", icon: <Settings2 />, render: () => <GeneralSection /> },
  { id: "capture", icon: <Camera />, render: () => <CaptureSection /> },
  { id: "shortcuts", icon: <Keyboard />, render: () => <ShortcutsSection /> },
  { id: "storage", icon: <HardDrive />, render: () => <StorageSection /> },
  { id: "ocr", icon: <ScanText />, render: () => <OcrSection /> },
  { id: "appearance", icon: <Palette />, render: () => <AppearanceSection /> },
  { id: "language", icon: <Languages />, render: () => <LanguageSection /> },
  { id: "privacy", icon: <ShieldCheck />, render: () => <PrivacySection /> },
  { id: "notifications", icon: <Bell />, render: () => <NotificationsSection /> },
  { id: "advanced", icon: <Wrench />, render: () => <AdvancedSection /> },
  { id: "about", icon: <Info />, render: () => <AboutSection /> },
];

export function SettingsPage({ section = "general" }: { section?: SettingsSection }) {
  const { t } = useTranslation();
  const navigate = useUi((s) => s.navigate);
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]!;
  return (
    <div className="flex h-full">
      <nav className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-e border-border px-3 py-5" aria-label={t("settings.title")}>
        <h1 className="mb-3 px-2.5 text-xl font-semibold tracking-[-0.01em] text-fg">{t("settings.title")}</h1>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={s.id === current.id ? "page" : undefined}
            onClick={() => navigate({ page: "settings", section: s.id })}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-start text-[0.8125rem] font-medium transition-colors [&>svg]:size-4",
              s.id === current.id ? "bg-surface text-fg shadow-soft [&>svg]:text-accent" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            {s.icon}
            {t(`settings.sections.${s.id}`)}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div key={current.id} className="mx-auto max-w-3xl animate-fade-in px-8 py-6">
          <h2 className="mb-5 text-lg font-semibold text-fg">{t(`settings.sections.${current.id}`)}</h2>
          {current.render()}
        </div>
      </div>
    </div>
  );
}
