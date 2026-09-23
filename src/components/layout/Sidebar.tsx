import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Clock,
  CopyCheck,
  FolderClosed,
  HardDrive,
  Hash,
  Images,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ScanText,
  Settings as SettingsIcon,
  Star,
  Trash2,
} from "lucide-react";
import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { Tooltip } from "@/components/ui/Tooltip";
import { IconButton } from "@/components/ui/IconButton";
import { CollectionIcon } from "@/features/collections/icons";
import { useCollections, useStatus } from "@/hooks/useData";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useTasks } from "@/features/tasks/useTasks";
import { useUi, type Route } from "@/stores/ui";
import { cn } from "@/utils/cn";
import { formatBytes, formatNumber } from "@/utils/format";

function isActive(route: Route, target: Route): boolean {
  if (route.page !== target.page) {
    // Collection/tag detail pages highlight their parent section.
    if (target.page === "collections" && route.page === "collection") return true;
    if (target.page === "tags" && route.page === "tag") return true;
    if (target.page === "library" && route.page === "search") return (target as { scope: string }).scope === "all";
    return false;
  }
  if (route.page === "library" && target.page === "library") return route.scope === target.scope;
  return true;
}

function NavItem({
  icon,
  label,
  target,
  compact,
  trailing,
}: {
  icon: ReactNode;
  label: string;
  target: Route;
  compact: boolean;
  trailing?: ReactNode;
}) {
  const route = useUi((s) => s.route);
  const navigate = useUi((s) => s.navigate);
  const active = isActive(route, target);
  const btn = (
    <button
      type="button"
      onClick={() => navigate(target)}
      aria-current={active ? "page" : undefined}
      aria-label={compact ? label : undefined}
      className={cn(
        "group relative flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[0.8125rem] font-medium transition-colors duration-150 [&>svg]:size-[1.0625rem] [&>svg]:shrink-0",
        compact && "justify-center px-0",
        active ? "bg-surface text-fg shadow-soft [&>svg]:text-accent" : "text-fg-muted hover:bg-surface-2/70 hover:text-fg",
      )}
    >
      {icon}
      {!compact && <span className="flex-1 truncate text-start">{label}</span>}
      {!compact && trailing}
    </button>
  );
  return compact ? (
    <Tooltip label={label} side="right">
      {btn}
    </Tooltip>
  ) : (
    btn
  );
}

function Group({ label, compact, children, action }: { label: string; compact: boolean; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      {!compact ? (
        <div className="flex h-7 items-center justify-between px-2.5 pt-2">
          <span className="text-[0.6875rem] font-semibold tracking-wide text-fg-subtle uppercase">{label}</span>
          {action}
        </div>
      ) : (
        <div className="mx-auto my-2 h-px w-6 bg-border" />
      )}
      {children}
    </div>
  );
}

export function Sidebar() {
  const { t, i18n } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();
  const compact = settings.sidebarStyle === "compact";
  const { collections } = useCollections();
  const { data: status } = useStatus();
  const { running } = useTasks();
  const navigate = useUi((s) => s.navigate);
  const openDialog = useUi((s) => s.openDialog);
  const lang = i18n.language;

  const statusText = running.length
    ? t("status.working")
    : status?.monitoringPaused
      ? t("status.paused")
      : status && status.watchedFolders > 0
        ? t("status.monitoring", { count: status.watchedFolders })
        : t("status.ready");
  const statusColor = running.length ? "bg-accent animate-pulse" : status?.monitoringPaused ? "bg-warning" : "bg-success";

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-e border-border bg-bg-subtle transition-[width] duration-200",
        compact ? "w-[4.25rem]" : "w-60",
      )}
    >
      <div className={cn("drag-region flex h-12 shrink-0 items-center gap-2.5", compact ? "justify-center" : "px-4")}>
        <LogoMark className="size-7 shrink-0" />
        {!compact && <Wordmark />}
      </div>

      <nav className={cn("flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-3", compact ? "px-2.5" : "px-2.5")} aria-label="Main">
        <div className="flex flex-col gap-0.5 pt-1">
          <NavItem compact={compact} icon={<LayoutDashboard />} label={t("nav.dashboard")} target={{ page: "dashboard" }} />
        </div>
        <Group label={t("nav.groupLibrary")} compact={compact}>
          <NavItem compact={compact} icon={<Images />} label={t("nav.library")} target={{ page: "library", scope: "all" }} />
          <NavItem compact={compact} icon={<Clock />} label={t("nav.recent")} target={{ page: "library", scope: "recent" }} />
          <NavItem compact={compact} icon={<Star />} label={t("nav.favorites")} target={{ page: "library", scope: "favorites" }} />
          <NavItem compact={compact} icon={<ScanText />} label={t("nav.ocrSearch")} target={{ page: "ocr" }} />
        </Group>
        <Group
          label={t("nav.groupOrganize")}
          compact={compact}
          action={
            <IconButton size="sm" label={t("collections.new")} className="size-5.5 rounded-md" onClick={() => openDialog("collection", {})}>
              <Plus className="size-3.5" />
            </IconButton>
          }
        >
          <NavItem compact={compact} icon={<FolderClosed />} label={t("nav.collections")} target={{ page: "collections" }} />
          <NavItem compact={compact} icon={<Hash />} label={t("nav.tags")} target={{ page: "tags" }} />
          {!compact &&
            collections.slice(0, 8).map((c) => (
              <NavItem
                key={c.id}
                compact={false}
                icon={<CollectionIcon icon={c.icon} color={c.color} size="xs" />}
                label={c.name}
                target={{ page: "collection", id: c.id }}
                trailing={<span className="text-[0.6875rem] text-fg-subtle tabular-nums">{formatNumber(c.count, lang)}</span>}
              />
            ))}
        </Group>
        <Group label={t("nav.groupTools")} compact={compact}>
          <NavItem compact={compact} icon={<HardDrive />} label={t("nav.storage")} target={{ page: "storage" }} />
          <NavItem compact={compact} icon={<CopyCheck />} label={t("nav.duplicates")} target={{ page: "duplicates" }} />
          <NavItem compact={compact} icon={<Trash2 />} label={t("nav.trash")} target={{ page: "trash" }} />
        </Group>
      </nav>

      <div className={cn("shrink-0 border-t border-border", compact ? "px-2 py-3" : "p-3")}>
        {!compact ? (
          <div className="mb-3 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-soft">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-fg">{t("status.storageUsed", { size: formatBytes(t, status?.totalBytes ?? 0, lang) })}</span>
              <span className="text-fg-subtle tabular-nums">{formatNumber(status?.count ?? 0, lang)}</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[0.6875rem] text-fg-muted">
              <span className={cn("size-1.5 rounded-full", statusColor)} />
              <span className="truncate">{statusText}</span>
            </div>
          </div>
        ) : null}
        <div className={cn("flex items-center gap-1", compact ? "flex-col" : "")}>
          <Tooltip label={t("status.language")} side={compact ? "right" : "top"}>
            <button
              type="button"
              aria-label={t("status.language")}
              onClick={() => void update({ language: lang === "ar" ? "en" : "ar" })}
              className={cn(
                "flex h-8 items-center gap-2 rounded-lg px-2 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg",
                !compact && "flex-1",
              )}
            >
              <span className="inline-flex size-5 items-center justify-center rounded-md bg-surface-3 text-[0.625rem] font-bold text-fg">
                {lang === "ar" ? "ع" : "EN"}
              </span>
              {!compact && <span className="truncate">{t(`languages.${lang}`)}</span>}
            </button>
          </Tooltip>
          <IconButton
            label={compact ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
            tooltipSide={compact ? "right" : "top"}
            onClick={() => void update({ sidebarStyle: compact ? "expanded" : "compact" })}
          >
            {compact ? <PanelLeftOpen className="flip-rtl size-4" /> : <PanelLeftClose className="flip-rtl size-4" />}
          </IconButton>
          <IconButton label={t("status.settings")} tooltipSide={compact ? "right" : "top"} onClick={() => navigate({ page: "settings" })}>
            <SettingsIcon className="size-4" />
          </IconButton>
        </div>
      </div>
    </aside>
  );
}
