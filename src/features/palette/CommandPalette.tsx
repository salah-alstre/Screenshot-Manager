import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { useTranslation } from "react-i18next";
import {
  AppWindow,
  Camera,
  Clock,
  CopyCheck,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  Hash,
  HardDrive,
  Images,
  Languages,
  LayoutDashboard,
  Monitor,
  Moon,
  ScanText,
  ScrollText,
  Search,
  Settings,
  Star,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";
import { CollectionIcon } from "@/features/collections/icons";
import { useActions } from "@/hooks/useActions";
import { useCollections } from "@/hooks/useData";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { api } from "@/services/api";
import { useUi, type Route } from "@/stores/ui";
import { Kbd } from "@/components/ui/Kbd";
import { cn } from "@/utils/cn";
import { normalize } from "@/utils/normalize";

interface Command {
  id: string;
  group: "actions" | "navigation" | "preferences" | "collections";
  label: string;
  icon: ReactNode;
  shortcut?: string;
  keywords?: string;
  run: () => void;
}

function score(text: string, q: string): number {
  if (!q) return 1;
  const t = normalize(text);
  if (t.startsWith(q)) return 3;
  if (t.includes(q)) return 2;
  // Subsequence match (e.g. "ocrs" → "OCR Search").
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  return i === q.length ? 1 : 0;
}

export function CommandPalette() {
  const { t, i18n } = useTranslation();
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const navigate = useUi((s) => s.navigate);
  const settings = useSettings();
  const update = useUpdateSettings();
  const actions = useActions();
  const { collections } = useCollections();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (route: Route) => () => navigate(route);
    const isDark = settings.theme === "dark" || settings.theme === "oled" || (settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    return [
      { id: "capture", group: "actions", label: t("palette.cmd.capture"), icon: <Camera />, shortcut: settings.hotkeys.region, keywords: "screenshot snap region", run: () => void actions.capture("region") },
      { id: "captureWindow", group: "actions", label: t("palette.cmd.captureWindow"), icon: <AppWindow />, run: () => void actions.capture("window") },
      { id: "captureFull", group: "actions", label: t("palette.cmd.captureFullscreen"), icon: <Monitor />, shortcut: settings.hotkeys.fullscreen, run: () => void actions.capture("fullscreen") },
      { id: "search", group: "actions", label: t("palette.cmd.search"), icon: <Search />, shortcut: settings.keybindings.search, run: () => useUi.getState().focusSearch() },
      { id: "newCollection", group: "actions", label: t("palette.cmd.createCollection"), icon: <FolderPlus />, run: () => useUi.getState().openDialog("collection", {}) },
      { id: "newTag", group: "actions", label: t("palette.cmd.createTag"), icon: <Tag />, run: () => useUi.getState().openDialog("tag", {}) },
      { id: "ocr", group: "actions", label: t("palette.cmd.runOcr"), icon: <ScanText />, keywords: "ocr text extract", run: () => void actions.runOcrPending() },
      { id: "import", group: "actions", label: t("palette.cmd.import"), icon: <Upload />, run: () => void actions.importFiles() },
      { id: "openFolder", group: "actions", label: t("palette.cmd.openFolder"), icon: <FolderOpen />, run: () => void api.openLibraryFolder() },
      { id: "dashboard", group: "navigation", label: t("nav.dashboard"), icon: <LayoutDashboard />, run: go({ page: "dashboard" }) },
      { id: "library", group: "navigation", label: t("nav.library"), icon: <Images />, run: go({ page: "library", scope: "all" }) },
      { id: "recent", group: "navigation", label: t("nav.recent"), icon: <Clock />, run: go({ page: "library", scope: "recent" }) },
      { id: "favorites", group: "navigation", label: t("nav.favorites"), icon: <Star />, run: go({ page: "library", scope: "favorites" }) },
      { id: "collections", group: "navigation", label: t("nav.collections"), icon: <FolderClosed />, run: go({ page: "collections" }) },
      { id: "tags", group: "navigation", label: t("nav.tags"), icon: <Hash />, run: go({ page: "tags" }) },
      { id: "ocrSearch", group: "navigation", label: t("nav.ocrSearch"), icon: <ScanText />, run: go({ page: "ocr" }) },
      { id: "storage", group: "navigation", label: t("nav.storage"), icon: <HardDrive />, run: go({ page: "storage" }) },
      { id: "duplicates", group: "navigation", label: t("nav.duplicates"), icon: <CopyCheck />, run: go({ page: "duplicates" }) },
      { id: "trash", group: "navigation", label: t("nav.trash"), icon: <Trash2 />, run: go({ page: "trash" }) },
      { id: "settings", group: "navigation", label: t("nav.settings"), icon: <Settings />, run: go({ page: "settings" }) },
      { id: "theme", group: "preferences", label: t("palette.cmd.toggleTheme"), icon: <Moon />, keywords: "dark light theme", run: () => void update({ theme: isDark ? "light" : "dark" }) },
      { id: "language", group: "preferences", label: t("palette.cmd.switchLanguage"), icon: <Languages />, keywords: "language arabic english عربي", run: () => void update({ language: i18n.language === "ar" ? "en" : "ar" }) },
      { id: "logs", group: "preferences", label: t("palette.cmd.openLogs"), icon: <ScrollText />, run: () => void api.openLogsFolder() },
      ...collections.map<Command>((c) => ({
        id: `col-${c.id}`,
        group: "collections",
        label: c.name,
        icon: <CollectionIcon icon={c.icon} color={c.color} size="xs" />,
        run: go({ page: "collection", id: c.id }),
      })),
    ];
  }, [t, i18n.language, settings, actions, collections, navigate, update]);

  const q = normalize(query.trim());
  const results = useMemo(() => {
    const scored = commands
      .map((c) => ({ c, s: Math.max(score(c.label, q), score(c.keywords ?? "", q) - 1) }))
      .filter((x) => x.s > 0);
    if (q) scored.sort((a, b) => b.s - a.s);
    const list = scored.map((x) => x.c);
    if (query.trim()) {
      list.push({
        id: "search-query",
        group: "actions",
        label: t("palette.searchFor", { query: query.trim() }),
        icon: <Search />,
        run: () => navigate({ page: "search", query: query.trim() }),
      });
    }
    return list;
  }, [commands, q, query, t, navigate]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    setTimeout(c.run, 0);
  };

  const groups: Command["group"][] = ["actions", "navigation", "collections", "preferences"];
  let idx = -1;

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[70] animate-fade-in bg-[var(--overlay)]" />
        <D.Content
          aria-describedby={undefined}
          className="glass fixed top-[14vh] left-1/2 z-[71] flex max-h-[60vh] w-[36rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 animate-scale-in flex-col overflow-hidden rounded-2xl border border-border shadow-pop"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(q ? results[active] : groups.flatMap((g) => results.filter((r) => r.group === g))[active]);
            }
          }}
        >
          <D.Title className="sr-only">{t("titlebar.commandPalette")}</D.Title>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-fg-subtle" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("palette.placeholder")}
              aria-label={t("palette.placeholder")}
              className="h-13 flex-1 bg-transparent text-[0.9375rem] text-fg placeholder:text-fg-subtle"
            />
            <Kbd keys="Esc" small />
          </div>
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2" role="listbox">
            {results.length === 0 ? <p className="px-3 py-8 text-center text-[0.8125rem] text-fg-subtle">{t("palette.noResults")}</p> : null}
            {(q ? [null] : groups).map((group) => {
              const items = group ? results.filter((r) => r.group === group) : results;
              if (!items.length) return null;
              return (
                <div key={group ?? "all"} className="mb-1">
                  {group ? <p className="px-2.5 pt-2 pb-1 text-[0.6875rem] font-semibold tracking-wide text-fg-subtle uppercase">{t(`palette.groups.${group}`)}</p> : null}
                  {items.map((c) => {
                    idx += 1;
                    const i = idx;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={active === i}
                        data-idx={i}
                        onMouseMove={() => setActive(i)}
                        onClick={() => run(c)}
                        className={cn(
                          "flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-start text-[0.8125rem] text-fg [&>svg]:size-4 [&>svg]:text-fg-muted",
                          active === i && "bg-accent-soft",
                        )}
                      >
                        {c.icon}
                        <span className="flex-1 truncate">{c.label}</span>
                        {c.shortcut ? <Kbd keys={c.shortcut} small /> : null}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[0.6875rem] text-fg-subtle">
            <span className="flex items-center gap-1.5">
              <Kbd keys="↑" small />
              <Kbd keys="↓" small /> {t("palette.hint.navigate")}
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd keys="Enter" small /> {t("palette.hint.select")}
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd keys="Esc" small /> {t("palette.hint.close")}
            </span>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
