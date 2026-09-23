import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Copy,
  Download,
  ExternalLink,
  FolderInput,
  FolderMinus,
  FolderOpen,
  Hash,
  PencilLine,
  Plus,
  RotateCcw,
  ScanText,
  Star,
  StarOff,
  TextCursorInput,
  Trash2,
  XCircle,
} from "lucide-react";
import { Context, Dropdown } from "@/components/ui/Menu";
import { CollectionIcon } from "@/features/collections/icons";
import { useActions } from "@/hooks/useActions";
import { useCollections, useTags } from "@/hooks/useData";
import { useSettings } from "@/hooks/useSettings";
import { useUi } from "@/stores/ui";
import type { ListQuery, ScreenshotSummary } from "@/types/models";
import { colorHex } from "@/utils/colors";

export type MenuEntry =
  | { type: "item"; key: string; icon?: ReactNode; label: string; shortcut?: string; danger?: boolean; disabled?: boolean; onSelect: () => void }
  | { type: "sep"; key: string }
  | { type: "sub"; key: string; icon?: ReactNode; label: string; items: MenuEntry[] };

/**
 * The actions available for a screenshot (or the current selection, when the
 * screenshot is part of it). Shared by the context menu and "More" dropdowns.
 */
export function useScreenshotMenu(
  shot: ScreenshotSummary,
  targetIds: number[],
  ctx: { query: ListQuery | null; index: number; inTrash: boolean },
): MenuEntry[] {
  const { t } = useTranslation();
  const actions = useActions();
  const settings = useSettings();
  const { collections } = useCollections();
  const { tags } = useTags();
  const openDialog = useUi((s) => s.openDialog);
  const kb = settings.keybindings;
  const multi = targetIds.length > 1;

  if (ctx.inTrash) {
    return [
      { type: "item", key: "open", icon: <ExternalLink />, label: t("menu.open"), shortcut: kb.open, disabled: multi, onSelect: () => actions.open(shot.id, ctx.query, ctx.index) },
      { type: "sep", key: "s1" },
      { type: "item", key: "restore", icon: <RotateCcw />, label: t("menu.restore"), onSelect: () => void actions.restore(targetIds) },
      { type: "item", key: "delete", icon: <XCircle />, label: t("menu.deletePermanently"), danger: true, onSelect: () => void actions.deletePermanently(targetIds) },
    ];
  }

  const allFav = multi ? false : shot.isFavorite;
  const tagItems: MenuEntry[] = [
    ...tags.map<MenuEntry>((tag) => ({
      type: "item",
      key: `tag-${tag.id}`,
      icon: <Hash style={{ color: colorHex(tag.color) }} />,
      label: tag.name,
      onSelect: () =>
        shot.tagIds.includes(tag.id) && !multi
          ? void actions.removeTag(targetIds, tag.id, tag.name)
          : void actions.addTag(targetIds, tag.id, tag.name),
    })),
    ...(tags.length ? [{ type: "sep", key: "tsep" } as MenuEntry] : []),
    { type: "item", key: "newtag", icon: <Plus />, label: t("menu.newTag"), onSelect: () => openDialog("tag", { assignIds: targetIds }) },
  ];
  const collectionItems: MenuEntry[] = [
    ...collections.map<MenuEntry>((c) => ({
      type: "item",
      key: `col-${c.id}`,
      icon: <CollectionIcon icon={c.icon} color={c.color} size="xs" />,
      label: c.name,
      disabled: !multi && shot.collectionId === c.id,
      onSelect: () => void actions.moveToCollection(targetIds, c.id),
    })),
    ...(collections.length ? [{ type: "sep", key: "csep" } as MenuEntry] : []),
    ...(shot.collectionId !== null || multi
      ? [{ type: "item", key: "nocol", icon: <FolderMinus />, label: t("menu.noCollection"), onSelect: () => void actions.moveToCollection(targetIds, null) } as MenuEntry]
      : []),
    { type: "item", key: "newcol", icon: <Plus />, label: t("menu.newCollection"), onSelect: () => openDialog("collection", { assignIds: targetIds }) },
  ];

  return [
    { type: "item", key: "open", icon: <ExternalLink />, label: t("menu.open"), shortcut: kb.open, disabled: multi, onSelect: () => actions.open(shot.id, ctx.query, ctx.index) },
    { type: "item", key: "edit", icon: <PencilLine />, label: t("menu.edit"), shortcut: kb.edit, disabled: multi || shot.missing, onSelect: () => actions.edit(shot.id) },
    { type: "item", key: "copy", icon: <Copy />, label: t("menu.copy"), shortcut: kb.copy, disabled: multi || shot.missing, onSelect: () => void actions.copy(shot.id) },
    {
      type: "item",
      key: "fav",
      icon: allFav ? <StarOff /> : <Star />,
      label: allFav ? t("menu.unfavorite") : t("menu.favorite"),
      shortcut: kb.favorite,
      onSelect: () => void actions.setFavorite(targetIds, !allFav),
    },
    { type: "sep", key: "s1" },
    { type: "sub", key: "tags", icon: <Hash />, label: t("menu.addTag"), items: tagItems },
    { type: "sub", key: "move", icon: <FolderInput />, label: t("menu.moveToCollection"), items: collectionItems },
    { type: "sep", key: "s2" },
    { type: "item", key: "loc", icon: <FolderOpen />, label: t("menu.openFileLocation"), disabled: multi || shot.missing, onSelect: () => void actions.openLocation(shot.id) },
    { type: "item", key: "ocr", icon: <ScanText />, label: t("menu.extractText"), disabled: !settings.ocrEnabled, onSelect: () => void actions.runOcr(targetIds) },
    { type: "item", key: "export", icon: <Download />, label: t("menu.export"), onSelect: () => actions.exportMany(targetIds) },
    { type: "item", key: "rename", icon: <TextCursorInput />, label: t("menu.rename"), disabled: multi, onSelect: () => actions.rename(shot.id, shot.name) },
    { type: "sep", key: "s3" },
    { type: "item", key: "trash", icon: <Trash2 />, label: t("menu.moveToTrash"), shortcut: kb.delete, danger: true, onSelect: () => void actions.trash(targetIds) },
  ];
}

export function renderContextEntries(entries: MenuEntry[]): ReactNode {
  return entries.map((e) =>
    e.type === "sep" ? (
      <Context.Separator key={e.key} />
    ) : e.type === "sub" ? (
      <Context.Sub key={e.key} label={e.label} icon={e.icon}>
        {renderContextEntries(e.items)}
      </Context.Sub>
    ) : (
      <Context.Item key={e.key} icon={e.icon} shortcut={e.shortcut} danger={e.danger} disabled={e.disabled} onSelect={e.onSelect}>
        {e.label}
      </Context.Item>
    ),
  );
}

export function renderDropdownEntries(entries: MenuEntry[]): ReactNode {
  return entries.map((e) =>
    e.type === "sep" ? (
      <Dropdown.Separator key={e.key} />
    ) : e.type === "sub" ? (
      <Dropdown.Sub key={e.key} label={e.label} icon={e.icon}>
        {renderDropdownEntries(e.items)}
      </Dropdown.Sub>
    ) : (
      <Dropdown.Item key={e.key} icon={e.icon} shortcut={e.shortcut} danger={e.danger} disabled={e.disabled} onSelect={e.onSelect}>
        {e.label}
      </Dropdown.Item>
    ),
  );
}
