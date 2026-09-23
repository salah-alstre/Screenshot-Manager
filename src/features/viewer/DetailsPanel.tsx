import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Copy, FolderOpen, Plus } from "lucide-react";
import { Dropdown } from "@/components/ui/Menu";
import { IconButton } from "@/components/ui/IconButton";
import { TagChip } from "@/components/ui/feedback";
import { CollectionIcon } from "@/features/collections/icons";
import { TagPicker } from "@/features/tags/TagPicker";
import { useActions } from "@/hooks/useActions";
import { useCollections, useTags } from "@/hooks/useData";
import { api } from "@/services/api";
import { toast } from "@/stores/toast";
import type { ScreenshotDetail } from "@/types/models";
import { formatBytes, formatDate, formatDateTime, formatDimensions, formatNumber, formatTime } from "@/utils/format";

function Row({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-1.5 text-[0.8125rem]">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className={mono ? "selectable min-w-0 font-mono text-xs break-all text-fg" : "min-w-0 text-fg"}>{children}</dd>
    </div>
  );
}

export function DetailsPanel({ shot }: { shot: ScreenshotDetail }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const actions = useActions();
  const { collections, byId } = useCollections();
  const { byId: tagsById } = useTags();
  const collection = shot.collectionId ? byId.get(shot.collectionId) : undefined;
  const tags = shot.tagIds.map((id) => tagsById.get(id)).filter((x) => !!x);
  const monitorLabel = shot.sourceMonitor?.replace(/Display (\d+)/g, (_m, n: string) => `${t("viewer.modes.monitor")} ${n}`);

  return (
    <div className="flex flex-col gap-5 overflow-y-auto p-4">
      <section>
        <h3 className="mb-2 text-xs font-semibold text-fg-muted">{t("viewer.tags")}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <TagChip
              key={tag.id}
              name={tag.name}
              color={tag.color}
              removeLabel={t("common.remove")}
              onRemove={() => void actions.removeTag([shot.id], tag.id, tag.name)}
            />
          ))}
          <TagPicker
            activeIds={shot.tagIds}
            onToggle={(tagId, name, active) =>
              active ? void actions.removeTag([shot.id], tagId, name) : void actions.addTag([shot.id], tagId, name)
            }
            onCreate={(name) => void actions.addTagByName([shot.id], name)}
            trigger={
              <button
                type="button"
                className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-border-strong px-2 text-xs text-fg-muted hover:border-accent hover:text-accent"
              >
                <Plus className="size-3" />
                {t("common.addTag")}
              </button>
            }
          />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold text-fg-muted">{t("viewer.collection")}</h3>
        <Dropdown.Root>
          <Dropdown.Trigger asChild>
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-start text-[0.8125rem] shadow-soft hover:border-border-strong"
            >
              {collection ? (
                <>
                  <CollectionIcon icon={collection.icon} color={collection.color} size="xs" />
                  <span className="flex-1 truncate text-fg">{collection.name}</span>
                </>
              ) : (
                <span className="flex-1 text-fg-subtle">{t("viewer.noCollection")}</span>
              )}
            </button>
          </Dropdown.Trigger>
          <Dropdown.Content align="start" className="min-w-64">
            <Dropdown.Radio checked={!collection} onSelect={() => void actions.moveToCollection([shot.id], null)}>
              {t("viewer.noCollection")}
            </Dropdown.Radio>
            {collections.length ? <Dropdown.Separator /> : null}
            {collections.map((c) => (
              <Dropdown.Radio
                key={c.id}
                checked={c.id === shot.collectionId}
                icon={<CollectionIcon icon={c.icon} color={c.color} size="xs" />}
                onSelect={() => void actions.moveToCollection([shot.id], c.id)}
              >
                {c.name}
              </Dropdown.Radio>
            ))}
          </Dropdown.Content>
        </Dropdown.Root>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold text-fg-muted">{t("viewer.meta.title")}</h3>
        <dl className="divide-y divide-border">
          <Row label={t("viewer.meta.date")}>{formatDate(shot.capturedAt, lang, { dateStyle: "full" })}</Row>
          <Row label={t("viewer.meta.time")}>{formatTime(shot.capturedAt, lang)}</Row>
          <Row label={t("viewer.meta.resolution")}>
            <span dir="ltr">{formatDimensions(t, shot.width, shot.height, lang)}</span>
          </Row>
          <Row label={t("viewer.meta.width")}>{formatNumber(shot.width, lang)} px</Row>
          <Row label={t("viewer.meta.height")}>{formatNumber(shot.height, lang)} px</Row>
          <Row label={t("viewer.meta.format")}>{shot.format.toUpperCase()}</Row>
          <Row label={t("viewer.meta.fileSize")}>{formatBytes(t, shot.fileSize, lang)}</Row>
          <Row label={t("viewer.meta.source")}>{t(`viewer.sources.${shot.source}`, { defaultValue: shot.source })}</Row>
          {shot.captureMode ? <Row label={t("viewer.meta.mode")}>{t(`viewer.modes.${shot.captureMode}`, { defaultValue: shot.captureMode })}</Row> : null}
          {monitorLabel ? <Row label={t("viewer.meta.monitor")}>{monitorLabel}</Row> : null}
          <Row label={t("viewer.meta.ocr")}>{t(`viewer.ocrStatus.${shot.ocrStatus}`)}</Row>
          {shot.fileCreatedAt ? <Row label={t("viewer.meta.created")}>{formatDateTime(shot.fileCreatedAt, lang)}</Row> : null}
          {shot.fileModifiedAt ? <Row label={t("viewer.meta.modified")}>{formatDateTime(shot.fileModifiedAt, lang)}</Row> : null}
          <Row label={t("viewer.meta.imported")}>{formatDateTime(shot.importedAt, lang)}</Row>
          <Row label={t("viewer.meta.filePath")} mono>
            <span dir="ltr" className="block text-start">
              {shot.filePath}
            </span>
            <span className="mt-1 flex gap-1">
              <IconButton
                size="sm"
                label={t("viewer.meta.copyPath")}
                onClick={() => void api.copyText(shot.filePath).then(() => toast.success(t("viewer.meta.pathCopied")))}
              >
                <Copy className="size-3.5" />
              </IconButton>
              <IconButton size="sm" label={t("common.openFileLocation")} disabled={!shot.fileExists} onClick={() => void actions.openLocation(shot.id)}>
                <FolderOpen className="size-3.5" />
              </IconButton>
            </span>
          </Row>
          {shot.editedPath ? (
            <Row label={t("viewer.meta.editedPath")} mono>
              <span dir="ltr" className="block text-start">
                {shot.editedPath}
              </span>
            </Row>
          ) : null}
        </dl>
      </section>
    </div>
  );
}
