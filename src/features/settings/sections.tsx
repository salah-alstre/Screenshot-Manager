import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ClipboardCopy,
  Cpu,
  Database,
  EyeOff,
  FolderOpen,
  FolderPlus,
  Code2,
  Image as ImageIcon,
  Lock,
  Monitor,
  Moon,
  PencilLine,
  RefreshCw,
  ScanText,
  ScrollText,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  Save,
  WifiOff,
} from "lucide-react";
import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { Segmented, Select, Slider, Switch } from "@/components/ui/controls";
import { useActions } from "@/hooks/useActions";
import { useAppInfo, useOcrLanguages, useStatus } from "@/hooks/useData";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { api } from "@/services/api";
import { errorMessage, isCancelled } from "@/services/errors";
import { invalidateLibrary } from "@/services/queryClient";
import { toast } from "@/stores/toast";
import { confirm, useUi } from "@/stores/ui";
import type { GlobalHotkeys, Keybindings, Settings } from "@/types/models";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { ChoiceCard, SettingRow, SettingsGroup } from "./common";
import { ShortcutRecorder } from "./ShortcutRecorder";

function useSetting() {
  const settings = useSettings();
  const update = useUpdateSettings();
  return { s: settings, set: update };
}

export function GeneralSection() {
  const { t } = useTranslation();
  const { s, set } = useSetting();
  const actions = useActions();
  return (
    <>
      <SettingsGroup>
        <SettingRow label={t("settings.general.startup")} description={t("settings.general.startupDesc")}>
          <Switch checked={s.launchAtStartup} onChange={(v) => void set({ launchAtStartup: v })} label={t("settings.general.startup")} />
        </SettingRow>
        <SettingRow label={t("settings.general.closeToTray")} description={t("settings.general.closeToTrayDesc")}>
          <Switch checked={s.closeToTray} onChange={(v) => void set({ closeToTray: v })} label={t("settings.general.closeToTray")} />
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup>
        <SettingRow label={t("settings.general.importFiles")} description={t("settings.general.importFilesDesc")}>
          <Button icon={<Upload className="size-4" />} onClick={() => void actions.importFiles()}>
            {t("settings.general.importButton")}
          </Button>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}

export function CaptureSection() {
  const { t, i18n } = useTranslation();
  const { s, set } = useSetting();
  const { data: info, refetch } = useAppInfo();
  const secs = (n: number) => t("settings.capture.seconds", { count: n, formatted: formatNumber(n, i18n.language) });

  const changeFolder = async () => {
    try {
      await api.chooseLibraryRoot();
      await refetch();
    } catch (e) {
      if (!isCancelled(e)) toast.error(errorMessage(t, e));
    }
  };

  const actionsList: { value: Settings["captureAction"]; icon: React.ReactNode; title: string; desc: string }[] = [
    { value: "save", icon: <Save />, title: t("settings.capture.actionSave"), desc: t("settings.capture.actionSaveDesc") },
    { value: "copy", icon: <ClipboardCopy />, title: t("settings.capture.actionCopy"), desc: t("settings.capture.actionCopyDesc") },
    { value: "saveCopy", icon: <ImageIcon />, title: t("settings.capture.actionSaveCopy"), desc: t("settings.capture.actionSaveCopyDesc") },
    { value: "editor", icon: <PencilLine />, title: t("settings.capture.actionEditor"), desc: t("settings.capture.actionEditorDesc") },
  ];

  return (
    <>
      <SettingsGroup>
        <SettingRow label={t("settings.capture.folder")} description={t("settings.capture.folderDesc")} stacked>
          <div className="flex items-center gap-2">
            <div dir="ltr" className="selectable h-8.5 min-w-0 flex-1 truncate rounded-lg border border-border bg-surface-2 px-3 text-start font-mono text-xs leading-8.5 text-fg">
              {info?.libraryRoot}
            </div>
            <Button onClick={() => void changeFolder()}>{t("common.change")}</Button>
            <Button variant="ghost" icon={<FolderOpen className="size-4" />} onClick={() => void api.openLibraryFolder()} aria-label={t("storage.openFolder")} />
          </div>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("settings.capture.behavior")} description={t("settings.capture.behaviorDesc")}>
        <div role="radiogroup" className="grid grid-cols-2 gap-2 p-3">
          {actionsList.map((a) => (
            <ChoiceCard key={a.value} selected={s.captureAction === a.value} onClick={() => void set({ captureAction: a.value })} icon={a.icon} title={a.title} description={a.desc} />
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup>
        <SettingRow label={t("settings.capture.popup")} description={t("settings.capture.popupDesc")}>
          <Switch checked={s.showCapturePopup} onChange={(v) => void set({ showCapturePopup: v })} label={t("settings.capture.popup")} />
        </SettingRow>
        <SettingRow label={t("settings.capture.cursor")}>
          <Switch checked={s.captureCursor} onChange={(v) => void set({ captureCursor: v })} label={t("settings.capture.cursor")} />
        </SettingRow>
        <SettingRow label={t("settings.capture.delay")} description={t("settings.capture.delayDesc")}>
          <Select
            value={String(s.captureDelay)}
            onChange={(v) => void set({ captureDelay: Number(v) })}
            label={t("settings.capture.delay")}
            options={[1, 2, 3, 5, 10, 15].map((n) => ({ value: String(n), label: secs(n) }))}
          />
        </SettingRow>
        <SettingRow label={t("settings.capture.fullscreenTarget")}>
          <Select
            value={s.fullscreenTarget}
            onChange={(v) => void set({ fullscreenTarget: v })}
            label={t("settings.capture.fullscreenTarget")}
            options={[
              { value: "cursor", label: t("settings.capture.targetCursor") },
              { value: "primary", label: t("settings.capture.targetPrimary") },
              { value: "all", label: t("settings.capture.targetAll") },
            ]}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup>
        <SettingRow label={t("settings.capture.format")} description={t("settings.capture.formatDesc")}>
          <Segmented
            value={s.imageFormat}
            onChange={(v) => void set({ imageFormat: v })}
            options={[
              { value: "png", label: "PNG" },
              { value: "jpg", label: "JPG" },
              { value: "webp", label: "WEBP" },
            ]}
          />
        </SettingRow>
        {s.imageFormat !== "png" ? (
          <QualityRow value={s.imageQuality} onCommit={(v) => void set({ imageQuality: v })} />
        ) : null}
      </SettingsGroup>
    </>
  );
}

function QualityRow({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const { t } = useTranslation();
  const [v, setV] = useState(value);
  return (
    <SettingRow label={`${t("settings.capture.quality")} · ${v}%`} description={t("settings.capture.qualityDesc")}>
      <div className="w-48">
        <Slider value={v} min={40} max={100} onChange={setV} onCommit={onCommit} label={t("settings.capture.quality")} />
      </div>
    </SettingRow>
  );
}

const GLOBAL_ACTIONS: (keyof GlobalHotkeys)[] = ["region", "window", "fullscreen", "openApp"];
const APP_ACTIONS: (keyof Keybindings)[] = ["commandPalette", "search", "capture", "open", "favorite", "edit", "copy", "delete"];
const DEFAULT_GLOBAL: GlobalHotkeys = { region: "Ctrl+Shift+1", window: "Ctrl+Shift+2", fullscreen: "Ctrl+Shift+3", openApp: "" };
const DEFAULT_APP: Keybindings = {
  commandPalette: "Ctrl+K",
  search: "Ctrl+F",
  favorite: "F",
  edit: "E",
  copy: "Ctrl+C",
  delete: "Delete",
  open: "Enter",
  capture: "Ctrl+N",
};

export function ShortcutsSection() {
  const { t } = useTranslation();
  const { s, set } = useSetting();
  const { data: failed = [], refetch } = useQuery({ queryKey: ["hotkeyStatus", s.hotkeys], queryFn: api.hotkeyStatus });

  const setGlobal = async (action: keyof GlobalHotkeys, value: string) => {
    const previous = s.hotkeys[action];
    const res = await set({ hotkeys: { [action]: value } });
    if (res.hotkeyErrors.includes(action) && value) {
      toast.error(t("settings.shortcuts.conflict"));
      await set({ hotkeys: { [action]: previous } });
    }
    void refetch();
  };

  const allAssigned = (except: string) => {
    const list: [string, string][] = [];
    for (const a of GLOBAL_ACTIONS) if (a !== except && s.hotkeys[a]) list.push([s.hotkeys[a], t(`settings.shortcuts.${a}`)]);
    for (const a of APP_ACTIONS) if (a !== except && s.keybindings[a]) list.push([s.keybindings[a], t(`settings.shortcuts.${a}`)]);
    return list;
  };
  const validate = (except: string) => (v: string) => {
    const hit = allAssigned(except).find(([k]) => k.toLowerCase() === v.toLowerCase());
    return hit ? t("settings.shortcuts.duplicate", { action: hit[1] }) : null;
  };

  return (
    <>
      <SettingsGroup title={t("settings.shortcuts.global")} description={t("settings.shortcuts.globalDesc")}>
        {GLOBAL_ACTIONS.map((a) => (
          <SettingRow
            key={a}
            label={
              <span className="flex items-center gap-2">
                {t(`settings.shortcuts.${a}`)}
                {failed.includes(a) ? (
                  <Tooltip label={t("settings.shortcuts.conflict")}>
                    <AlertTriangle className="size-3.5 text-warning" />
                  </Tooltip>
                ) : null}
              </span>
            }
          >
            <ShortcutRecorder global value={s.hotkeys[a]} onChange={(v) => void setGlobal(a, v)} validate={validate(a)} label={t(`settings.shortcuts.${a}`)} />
          </SettingRow>
        ))}
      </SettingsGroup>
      <SettingsGroup title={t("settings.shortcuts.inApp")} description={t("settings.shortcuts.inAppDesc")}>
        {APP_ACTIONS.map((a) => (
          <SettingRow key={a} label={t(`settings.shortcuts.${a}`)}>
            <ShortcutRecorder value={s.keybindings[a]} onChange={(v) => void set({ keybindings: { [a]: v } })} validate={validate(a)} label={t(`settings.shortcuts.${a}`)} />
          </SettingRow>
        ))}
      </SettingsGroup>
      <SettingsGroup title={t("settings.shortcuts.fixed")}>
        {[
          [t("settings.shortcuts.navigate"), "← → ↑ ↓"],
          [t("settings.shortcuts.select"), "Space"],
          [t("common.selectAll"), "Ctrl+A"],
          [t("settings.shortcuts.closeViewer"), "Esc"],
          [t("settings.shortcuts.undoRedo"), "Ctrl+Z / Ctrl+Y"],
        ].map(([label, keys]) => (
          <SettingRow key={label} label={label}>
            <span dir="ltr" className="font-mono text-xs text-fg-muted">
              {keys}
            </span>
          </SettingRow>
        ))}
      </SettingsGroup>
      <div className="flex justify-end">
        <Button
          variant="ghost"
          icon={<RefreshCw className="size-4" />}
          onClick={async () => {
            await set({ hotkeys: DEFAULT_GLOBAL, keybindings: DEFAULT_APP });
            void refetch();
          }}
        >
          {t("settings.shortcuts.resetDefaults")}
        </Button>
      </div>
    </>
  );
}

export function StorageSection() {
  const { t } = useTranslation();
  const { s, set } = useSetting();
  const navigate = useUi((st) => st.navigate);
  const folders = useQuery({ queryKey: ["watched"], queryFn: api.listWatchedFolders });
  const suggested = useQuery({ queryKey: ["watched", "suggested"], queryFn: api.suggestedWatchFolder });

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn();
      if (success) toast.success(success);
      await folders.refetch();
      await suggested.refetch();
      invalidateLibrary();
    } catch (e) {
      if (!isCancelled(e)) toast.error(errorMessage(t, e));
    }
  };

  return (
    <>
      <SettingsGroup title={t("settings.storage.watched")} description={t("settings.storage.watchedDesc")}>
        {folders.data?.length ? (
          folders.data.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3">
              <FolderOpen className={cn("size-4 shrink-0", f.available ? "text-fg-muted" : "text-warning")} />
              <div className="min-w-0 flex-1">
                <p dir="ltr" className="truncate text-start font-mono text-xs text-fg" title={f.path}>
                  {f.path}
                </p>
                {!f.available ? <p className="text-[0.6875rem] text-warning">{t("settings.storage.unavailable")}</p> : null}
              </div>
              <Switch checked={f.enabled} onChange={(v) => void run(() => api.setWatchedFolderEnabled(f.id, v))} label={f.path} />
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} aria-label={t("common.remove")} onClick={() => void run(() => api.removeWatchedFolder(f.id), t("toast.folderRemoved"))} />
            </div>
          ))
        ) : (
          <p className="px-4 py-4 text-xs text-fg-subtle">{t("settings.storage.noFolders")}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <Button icon={<FolderPlus className="size-4" />} onClick={() => void run(() => api.addWatchedFolder(), t("toast.folderAdded"))}>
            {t("settings.storage.addFolder")}
          </Button>
          {suggested.data ? (
            <Button variant="ghost" onClick={() => void run(() => api.addSuggestedWatchFolder(), t("toast.folderAdded"))}>
              <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[0.625rem] font-semibold text-accent">{t("settings.storage.suggested")}</span>
              <span dir="ltr" className="max-w-72 truncate font-mono text-xs">
                {suggested.data}
              </span>
            </Button>
          ) : null}
        </div>
      </SettingsGroup>

      <SettingsGroup>
        <SettingRow label={t("settings.storage.pause")} description={t("settings.storage.pauseDesc")}>
          <Switch checked={s.monitoringPaused} onChange={(v) => void set({ monitoringPaused: v })} label={t("settings.storage.pause")} />
        </SettingRow>
        <SettingRow label={t("settings.storage.copyDropped")} description={t("settings.storage.copyDroppedDesc")}>
          <Switch checked={s.copyDroppedFiles} onChange={(v) => void set({ copyDroppedFiles: v })} label={t("settings.storage.copyDropped")} />
        </SettingRow>
        <SettingRow label={t("settings.storage.trashPeriod")} description={t("settings.storage.trashPeriodDesc")}>
          <Select
            value={String(s.trashAutoDeleteDays)}
            onChange={(v) => void set({ trashAutoDeleteDays: Number(v) as Settings["trashAutoDeleteDays"] })}
            label={t("settings.storage.trashPeriod")}
            options={[
              { value: "0", label: t("settings.storage.never") },
              ...[7, 30, 60, 90].map((d) => ({ value: String(d), label: t("settings.storage.days", { count: d }) })),
            ]}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup>
        <SettingRow label={t("settings.storage.manage")} description={t("settings.storage.manageDesc")}>
          <Button onClick={() => navigate({ page: "storage" })}>{t("settings.storage.openStorage")}</Button>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}

export function OcrSection() {
  const { t } = useTranslation();
  const { s, set } = useSetting();
  const actions = useActions();
  const { data: langs } = useOcrLanguages();
  const { data: status } = useStatus();
  const pending = status?.ocrPending ?? 0;

  const rebuild = async () => {
    const count = status?.count ?? 0;
    const ok = await confirm({ title: t("settings.ocr.rebuildTitle"), description: t("settings.ocr.rebuildConfirm", { count }), confirmLabel: t("settings.ocr.start") });
    if (!ok) return;
    try {
      const n = await api.rebuildOcrIndex();
      toast.info(t("toast.ocrQueued", { count: n }));
    } catch (e) {
      toast.error(errorMessage(t, e));
    }
  };

  return (
    <>
      <SettingsGroup>
        <SettingRow label={t("settings.ocr.enabled")} description={t("settings.ocr.enabledDesc")}>
          <Switch checked={s.ocrEnabled} onChange={(v) => void set({ ocrEnabled: v })} label={t("settings.ocr.enabled")} />
        </SettingRow>
        <SettingRow label={t("settings.ocr.auto")} description={t("settings.ocr.autoDesc")}>
          <Switch checked={s.autoOcr} disabled={!s.ocrEnabled} onChange={(v) => void set({ autoOcr: v })} label={t("settings.ocr.auto")} />
        </SettingRow>
        <SettingRow
          label={t("settings.ocr.language")}
          description={langs?.installed.length ? t("settings.ocr.installed", { langs: langs.installed.join(", ") }) : undefined}
        >
          <Select
            value={s.ocrLanguage}
            onChange={(v) => void set({ ocrLanguage: v })}
            label={t("settings.ocr.language")}
            options={[
              { value: "auto", label: t("settings.ocr.langAuto") },
              { value: "ar+en", label: t("settings.ocr.langBoth") },
              { value: "ar", label: t("settings.ocr.langAr") },
              { value: "en", label: t("settings.ocr.langEn") },
            ]}
          />
        </SettingRow>
        {langs && !langs.installed.length ? (
          <div className="flex gap-2 px-4 py-3 text-xs text-warning">
            <AlertTriangle className="size-4 shrink-0" />
            {t("settings.ocr.noneInstalled")}
          </div>
        ) : langs && !langs.arabic && s.ocrLanguage !== "en" ? (
          <div className="flex gap-2 px-4 py-3 text-xs text-warning">
            <AlertTriangle className="size-4 shrink-0" />
            {t("settings.ocr.arabicMissing")}
          </div>
        ) : null}
      </SettingsGroup>
      <SettingsGroup>
        <SettingRow label={t("settings.ocr.processPending")} description={t("settings.ocr.processPendingDesc", { count: pending })}>
          <Button icon={<ScanText className="size-4" />} disabled={!s.ocrEnabled || !pending} onClick={() => void actions.runOcrPending()}>
            {t("settings.ocr.start")}
          </Button>
        </SettingRow>
        <SettingRow label={t("settings.ocr.rebuild")} description={t("settings.ocr.rebuildDesc")}>
          <Button icon={<RefreshCw className="size-4" />} disabled={!s.ocrEnabled} onClick={() => void rebuild()}>
            {t("settings.ocr.rebuild")}
          </Button>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}

function ThemePreview({ theme }: { theme: "light" | "dark" | "oled" | "system" }) {
  const palettes = {
    light: ["#f5f6f8", "#ffffff", "#e2e5ea"],
    dark: ["#0f1013", "#1d1f25", "#2b2e37"],
    oled: ["#000000", "#131316", "#23242a"],
  };
  const render = (p: string[]) => (
    <div className="flex h-full w-full gap-1 p-1.5" style={{ background: p[0] }}>
      <div className="w-1/4 rounded" style={{ background: p[1] }} />
      <div className="flex flex-1 flex-col gap-1">
        <div className="h-2 w-2/3 rounded-sm" style={{ background: p[2] }} />
        <div className="grid flex-1 grid-cols-3 gap-1">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-sm" style={{ background: i === 0 ? "var(--accent)" : p[1] }} />
          ))}
        </div>
      </div>
    </div>
  );
  return (
    <div className="h-16 overflow-hidden rounded-lg border border-border">
      {theme === "system" ? (
        <div className="flex h-full">
          <div className="w-1/2 overflow-hidden">{render(palettes.light)}</div>
          <div className="w-1/2 overflow-hidden">{render(palettes.dark)}</div>
        </div>
      ) : (
        render(palettes[theme])
      )}
    </div>
  );
}

export function AppearanceSection() {
  const { t } = useTranslation();
  const { s, set } = useSetting();
  const [scale, setScale] = useState(s.uiScale);
  const [thumb, setThumb] = useState(s.thumbnailSize);
  const themes: { value: Settings["theme"]; icon: React.ReactNode }[] = [
    { value: "system", icon: <Monitor /> },
    { value: "light", icon: <Sun /> },
    { value: "dark", icon: <Moon /> },
    { value: "oled", icon: <EyeOff /> },
  ];
  const accents: Settings["accent"][] = ["blue", "violet", "teal", "green", "amber", "rose"];
  const accentHex: Record<Settings["accent"], string> = { blue: "#4f7cff", violet: "#7c5cff", teal: "#0fa39a", green: "#22a358", amber: "#f0a020", rose: "#f0456a" };
  return (
    <>
      <SettingsGroup title={t("settings.appearance.theme")}>
        <div role="radiogroup" className="grid grid-cols-4 gap-2 p-3">
          {themes.map((th) => (
            <ChoiceCard key={th.value} selected={s.theme === th.value} onClick={() => void set({ theme: th.value })} icon={th.icon} title={t(`settings.appearance.${th.value}`)}>
              <ThemePreview theme={th.value} />
            </ChoiceCard>
          ))}
        </div>
      </SettingsGroup>
      <SettingsGroup>
        <SettingRow label={t("settings.appearance.accent")}>
          <div role="radiogroup" className="flex gap-2">
            {accents.map((a) => (
              <Tooltip key={a} label={t(`settings.appearance.accents.${a}`)}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={s.accent === a}
                  aria-label={t(`settings.appearance.accents.${a}`)}
                  onClick={() => void set({ accent: a })}
                  className={cn("size-6 rounded-full transition-transform hover:scale-110", s.accent === a && "ring-2 ring-offset-2 ring-offset-surface")}
                  style={{ background: accentHex[a], ["--tw-ring-color" as string]: accentHex[a] }}
                />
              </Tooltip>
            ))}
          </div>
        </SettingRow>
        <SettingRow label={`${t("settings.appearance.scale")} · ${Math.round(scale * 100)}%`} description={t("settings.appearance.scaleDesc")}>
          <div className="w-48">
            <Slider value={scale} min={0.85} max={1.25} step={0.05} onChange={setScale} onCommit={(v) => void set({ uiScale: Math.round(v * 100) / 100 })} label={t("settings.appearance.scale")} />
          </div>
        </SettingRow>
        <SettingRow label={`${t("settings.appearance.thumbSize")} · ${thumb}px`}>
          <div className="w-48">
            <Slider value={thumb} min={160} max={360} step={10} onChange={setThumb} onCommit={(v) => void set({ thumbnailSize: v })} label={t("settings.appearance.thumbSize")} />
          </div>
        </SettingRow>
        <SettingRow label={t("settings.appearance.animation")}>
          <Segmented
            value={s.animation}
            onChange={(v) => void set({ animation: v })}
            options={[
              { value: "full", label: t("settings.appearance.animFull") },
              { value: "reduced", label: t("settings.appearance.animReduced") },
              { value: "off", label: t("settings.appearance.animOff") },
            ]}
          />
        </SettingRow>
        <SettingRow label={t("settings.appearance.sidebar")}>
          <Segmented
            value={s.sidebarStyle}
            onChange={(v) => void set({ sidebarStyle: v })}
            options={[
              { value: "expanded", label: t("settings.appearance.sidebarExpanded") },
              { value: "compact", label: t("settings.appearance.sidebarCompact") },
            ]}
          />
        </SettingRow>
      </SettingsGroup>
    </>
  );
}

export function LanguageSection() {
  const { t } = useTranslation();
  const { s, set } = useSetting();
  return (
    <SettingsGroup title={t("settings.language.title")} description={t("settings.language.desc")}>
      <div role="radiogroup" className="grid grid-cols-2 gap-3 p-3">
        {(["en", "ar"] as const).map((l) => (
          <ChoiceCard key={l} selected={s.language === l} onClick={() => void set({ language: l })} title={<span lang={l}>{t(`languages.${l}`)}</span>} description={l === "ar" ? "RTL · من اليمين إلى اليسار" : "LTR · Left to right"}>
            <div dir={l === "ar" ? "rtl" : "ltr"} lang={l} className="flex h-16 items-center justify-center rounded-lg bg-surface-2 text-2xl font-semibold text-fg">
              {l === "ar" ? "مرحبًا" : "Hello"}
            </div>
          </ChoiceCard>
        ))}
      </div>
      <p className="px-4 py-3 text-xs text-fg-muted">{t("settings.language.numbers")}</p>
    </SettingsGroup>
  );
}

export function PrivacySection() {
  const { t } = useTranslation();
  const points = [
    { icon: <WifiOff />, text: t("settings.privacy.points.noUpload") },
    { icon: <Cpu />, text: t("settings.privacy.points.localOcr") },
    { icon: <EyeOff />, text: t("settings.privacy.points.noAnalytics") },
    { icon: <ScrollText />, text: t("settings.privacy.points.logs") },
    { icon: <Lock />, text: t("settings.privacy.points.optIn") },
  ];
  return (
    <>
      <div className="mb-6 rounded-2xl border border-success/25 bg-success/8 p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-success/15 text-success">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <p className="text-[0.9375rem] font-semibold text-fg">{t("settings.privacy.localTitle")}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{t("settings.privacy.localDesc")}</p>
          </div>
        </div>
        <ul className="mt-4 flex flex-col gap-2.5">
          {points.map((p) => (
            <li key={p.text} className="flex items-center gap-2.5 text-[0.8125rem] text-fg [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-success">
              {p.icon}
              {p.text}
            </li>
          ))}
        </ul>
      </div>
      <SettingsGroup>
        <SettingRow label={t("settings.privacy.clipboard")} description={t("settings.privacy.clipboardDesc")} />
        <SettingRow label={t("settings.privacy.redaction")} description={t("settings.privacy.redactionDesc")} />
      </SettingsGroup>
    </>
  );
}

export function NotificationsSection() {
  const { t } = useTranslation();
  const { s, set } = useSetting();
  const rows: { key: keyof Settings["notifications"]; label: string; desc?: string }[] = [
    { key: "capture", label: t("settings.notifications.capture"), desc: t("settings.notifications.captureDesc") },
    { key: "ocr", label: t("settings.notifications.ocr"), desc: t("settings.notifications.ocrDesc") },
    { key: "export", label: t("settings.notifications.export") },
    { key: "import", label: t("settings.notifications.import") },
  ];
  return (
    <SettingsGroup description={t("settings.notifications.desc")}>
      {rows.map((r) => (
        <SettingRow key={r.key} label={r.label} description={r.desc}>
          <Switch checked={s.notifications[r.key]} onChange={(v) => void set({ notifications: { [r.key]: v } })} label={r.label} />
        </SettingRow>
      ))}
    </SettingsGroup>
  );
}

export function AdvancedSection() {
  const { t } = useTranslation();
  const { set } = useSetting();
  const { data: info } = useAppInfo();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    try {
      await fn();
      if (success) toast.success(success);
      invalidateLibrary();
    } catch (e) {
      toast.error(errorMessage(t, e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <SettingsGroup>
        <SettingRow label={t("settings.advanced.logs")} description={t("settings.advanced.logsDesc")}>
          <Button icon={<ScrollText className="size-4" />} onClick={() => void run("logs", api.openLogsFolder)}>
            {t("settings.advanced.openLogs")}
          </Button>
        </SettingRow>
        <SettingRow
          label={t("settings.advanced.data")}
          description={
            <>
              {t("settings.advanced.dataDesc")}
              <span dir="ltr" className="mt-1 block text-start font-mono text-[0.6875rem] text-fg-subtle">
                {info?.dataDir}
              </span>
            </>
          }
        >
          <Button icon={<Database className="size-4" />} onClick={() => void run("data", api.openDataFolder)}>
            {t("settings.advanced.openData")}
          </Button>
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup>
        <SettingRow label={t("settings.advanced.thumbs")} description={t("settings.advanced.thumbsDesc")}>
          <Button loading={busy === "thumbs"} onClick={() => void run("thumbs", api.regenerateThumbnails)}>
            {t("settings.ocr.start")}
          </Button>
        </SettingRow>
        <SettingRow label={t("settings.advanced.reindex")} description={t("settings.advanced.reindexDesc")}>
          <Button loading={busy === "reindex"} onClick={() => void run("reindex", api.rebuildSearchIndex, t("settings.advanced.reindexed"))}>
            {t("settings.ocr.start")}
          </Button>
        </SettingRow>
        <SettingRow label={t("settings.advanced.onboarding")}>
          <Button onClick={() => void set({ onboardingCompleted: false })}>{t("common.open")}</Button>
        </SettingRow>
      </SettingsGroup>
      {info ? <p className="px-1 text-xs text-fg-subtle">{t("settings.advanced.database", { version: info.schemaVersion })}</p> : null}
    </>
  );
}

export function AboutSection() {
  const { t } = useTranslation();
  const { data: info } = useAppInfo();
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const tech = ["Tauri 2", "Rust", "React 19", "TypeScript", "Tailwind CSS", "SQLite + FTS5", "Windows OCR"];
  return (
    <>
      <div className="mb-6 flex flex-col items-center rounded-2xl border border-border bg-surface px-6 py-8 text-center shadow-soft">
        <LogoMark className="size-16 drop-shadow-lg" />
        <Wordmark className="mt-4 text-2xl" />
        <p className="mt-1 text-xs text-fg-subtle">{info ? t("settings.about.version", { version: info.version }) : " "}</p>
        <p className="mt-3 max-w-md text-[0.8125rem] leading-relaxed text-fg-muted">{t("settings.about.description")}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Tooltip label={info?.repositoryUrl ?? t("settings.about.githubUnset")}>
            <span>
              <Button icon={<Code2 className="size-4" />} disabled={!info?.repositoryUrl} onClick={() => info?.repositoryUrl && window.open(info.repositoryUrl)}>
                {t("settings.about.github")}
              </Button>
            </span>
          </Tooltip>
          <Button
            icon={<RefreshCw className="size-4" />}
            onClick={async () => {
              const r = await api.checkForUpdates();
              setUpdateMsg(r.status === "not_configured" ? t("settings.about.updatesNotConfigured") : r.status);
            }}
          >
            {t("settings.about.updates")}
          </Button>
        </div>
        {updateMsg ? <p className="mt-3 max-w-md text-xs text-fg-muted">{updateMsg}</p> : null}
      </div>
      <SettingsGroup>
        <SettingRow label={t("settings.about.tech")} stacked>
          <div className="flex flex-wrap gap-1.5">
            {tech.map((x) => (
              <span key={x} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-fg-muted">
                {x}
              </span>
            ))}
          </div>
        </SettingRow>
        <SettingRow label={t("settings.about.licenses")} description={t("settings.about.licensesDesc")} />
        {info ? (
          <SettingRow label="WebView2" description={<span dir="ltr">{info.webviewVersion} · Tauri {info.tauriVersion}</span>} />
        ) : null}
      </SettingsGroup>
    </>
  );
}
