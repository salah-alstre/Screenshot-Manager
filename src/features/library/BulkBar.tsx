import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Download, FolderInput, Hash, RotateCcw, ScanText, Star, StarOff, Tag as TagIcon, Trash2, X, XCircle } from "lucide-react";
import { Dropdown } from "@/components/ui/Menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { TagPicker } from "@/features/tags/TagPicker";
import { useActions } from "@/hooks/useActions";
import { useSettings } from "@/hooks/useSettings";
import { useSelection } from "@/stores/selection";
import { formatNumber } from "@/utils/format";
import { MoveMenu } from "./ScreenshotCard";

function BarButton({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick?: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[0.8125rem] font-medium transition-colors [&>svg]:size-4 ${
        danger ? "text-danger hover:bg-danger-soft" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
      }`}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

/** Floating toolbar for actions on the current multi-selection. */
export function BulkBar({ inTrash, onSelectAll }: { inTrash: boolean; onSelectAll: () => void }) {
  const { t, i18n } = useTranslation();
  const ids = useSelection((s) => s.ids);
  const clear = useSelection((s) => s.clear);
  const actions = useActions();
  const settings = useSettings();
  if (ids.size === 0) return null;
  const list = [...ids];

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-4">
      <div role="toolbar" aria-label={t("library.selected", { count: ids.size })} className="glass pointer-events-auto flex animate-slide-up items-center gap-1 rounded-2xl border border-border p-1.5 shadow-pop">
        <div className="flex items-center gap-2 ps-2 pe-1">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-fg tabular-nums">
            {formatNumber(ids.size, i18n.language)}
          </span>
          <button type="button" onClick={onSelectAll} className="text-xs font-medium text-fg-muted hover:text-fg">
            {t("common.selectAll")}
          </button>
        </div>
        <div className="mx-1 h-5 w-px bg-border" />
        {inTrash ? (
          <>
            <BarButton icon={<RotateCcw />} label={t("library.bulk.restore")} onClick={() => void actions.restore(list)} />
            <BarButton icon={<XCircle />} label={t("common.deletePermanently")} danger onClick={() => void actions.deletePermanently(list)} />
          </>
        ) : (
          <>
            <BarButton icon={<Star />} label={t("library.bulk.favorite")} onClick={() => void actions.setFavorite(list, true)} />
            <BarButton icon={<StarOff />} label={t("library.bulk.unfavorite")} onClick={() => void actions.setFavorite(list, false)} />
            <Dropdown.Root>
              <Dropdown.Trigger asChild>
                <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[0.8125rem] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">
                  <FolderInput className="size-4" />
                  <span className="hidden xl:inline">{t("library.bulk.move")}</span>
                </button>
              </Dropdown.Trigger>
              <Dropdown.Content align="center">
                <MoveMenu ids={list} current={null} />
              </Dropdown.Content>
            </Dropdown.Root>
            <TagPicker
              align="center"
              activeIds={[]}
              onToggle={(tagId, name) => void actions.addTag(list, tagId, name)}
              onCreate={(name) => void actions.addTagByName(list, name)}
              trigger={
                <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[0.8125rem] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">
                  <Hash className="size-4" />
                  <span className="hidden xl:inline">{t("library.bulk.addTag")}</span>
                </button>
              }
            />
            <TagPicker
              align="center"
              activeIds={[]}
              onToggle={(tagId, name) => void actions.removeTag(list, tagId, name)}
              trigger={
                <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[0.8125rem] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">
                  <TagIcon className="size-4" />
                  <span className="hidden xl:inline">{t("library.bulk.removeTag")}</span>
                </button>
              }
            />
            <BarButton icon={<Download />} label={t("library.bulk.export")} onClick={() => actions.exportMany(list)} />
            {settings.ocrEnabled ? <BarButton icon={<ScanText />} label={t("library.bulk.ocr")} onClick={() => void actions.runOcr(list)} /> : null}
            <BarButton icon={<Trash2 />} label={t("library.bulk.delete")} danger onClick={() => void actions.trash(list)} />
          </>
        )}
        <div className="mx-1 h-5 w-px bg-border" />
        <Tooltip label={t("common.clearSelection")} shortcut="Esc">
          <button type="button" aria-label={t("common.clearSelection")} onClick={clear} className="inline-flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg">
            <X className="size-4" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
