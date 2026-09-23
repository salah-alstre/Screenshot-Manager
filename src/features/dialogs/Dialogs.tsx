import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Segmented, Slider } from "@/components/ui/controls";
import { ColorSwatches } from "@/components/ui/feedback";
import { COLLECTION_ICONS } from "@/features/collections/icons";
import { useActions } from "@/hooks/useActions";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { api } from "@/services/api";
import { errorMessage, isCancelled } from "@/services/errors";
import { invalidateLibrary } from "@/services/queryClient";
import { toast } from "@/stores/toast";
import { useUi } from "@/stores/ui";
import { NAMED_COLORS, colorHex, softBg } from "@/utils/colors";
import { cn } from "@/utils/cn";

function useColorLabel() {
  const { t } = useTranslation();
  return (c: string) => t(`colors.${c}`, { defaultValue: c });
}

export function CollectionDialog() {
  const { t } = useTranslation();
  const state = useUi((s) => s.dialogs.collection);
  const close = () => useUi.getState().closeDialog("collection");
  const actions = useActions();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("folder");
  const [color, setColor] = useState("blue");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const colorLabel = useColorLabel();
  const editing = state?.collection;

  useEffect(() => {
    if (!state) return;
    setName(editing?.name ?? "");
    setIcon(editing?.icon ?? "folder");
    setColor(editing?.color ?? "blue");
    setError(null);
  }, [state, editing]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await api.updateCollection(editing.id, name, icon, color);
        toast.success(t("collections.updated"));
      } else {
        const created = await api.createCollection(name, icon, color);
        toast.success(t("collections.created"));
        if (state?.assignIds?.length) await actions.moveToCollection(state.assignIds, created.id);
      }
      invalidateLibrary(true);
      close();
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!state}
      onOpenChange={(o) => !o && close()}
      title={editing ? t("collections.editTitle") : t("collections.createTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => void submit()}>
            {editing ? t("common.save") : t("common.create")}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void submit();
        }}
      >
        <div className="flex items-end gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: softBg(color, 18), color: colorHex(color) }}>
            {(() => {
              const I = COLLECTION_ICONS[icon]!;
              return <I className="size-5" />;
            })()}
          </span>
          <div className="flex-1">
            <Field label={t("collections.name")}>
              <Input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t("collections.namePlaceholder")} />
            </Field>
          </div>
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <Field label={t("collections.icon")}>
          <div className="grid grid-cols-8 gap-1.5">
            {Object.entries(COLLECTION_ICONS).map(([key, I]) => (
              <button
                key={key}
                type="button"
                aria-label={key}
                aria-pressed={icon === key}
                onClick={() => setIcon(key)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg border transition-colors",
                  icon === key ? "border-accent bg-accent-soft text-accent" : "border-transparent text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                <I className="size-4" />
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("collections.color")}>
          <ColorSwatches colors={NAMED_COLORS} value={color} onChange={setColor} label={colorLabel} />
        </Field>
      </form>
    </Dialog>
  );
}

export function TagDialog() {
  const { t } = useTranslation();
  const state = useUi((s) => s.dialogs.tag);
  const close = () => useUi.getState().closeDialog("tag");
  const actions = useActions();
  const [name, setName] = useState("");
  const [color, setColor] = useState("blue");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const colorLabel = useColorLabel();
  const editing = state?.tag;

  useEffect(() => {
    if (!state) return;
    setName(editing?.name ?? "");
    setColor(editing?.color ?? NAMED_COLORS[Math.floor(Math.random() * NAMED_COLORS.length)]!);
    setError(null);
  }, [state, editing]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await api.updateTag(editing.id, name, color);
        toast.success(t("tags.updated"));
      } else if (state?.assignIds?.length) {
        await actions.addTagByName(state.assignIds, name, color);
      } else {
        await api.createTag(name, color);
        toast.success(t("tags.created"));
      }
      invalidateLibrary(true);
      close();
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!state}
      onOpenChange={(o) => !o && close()}
      title={editing ? t("tags.editTitle") : t("tags.createTitle")}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => void submit()}>
            {editing ? t("common.save") : t("common.create")}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void submit();
        }}
      >
        <Field label={t("tags.name")}>
          <div className="relative">
            <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 font-semibold" style={{ color: colorHex(color) }}>
              #
            </span>
            <Input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value.replace(/\s/g, ""))} placeholder={t("tags.namePlaceholder")} className="ps-7" />
          </div>
        </Field>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <Field label={t("tags.color")}>
          <ColorSwatches colors={NAMED_COLORS} value={color} onChange={setColor} label={colorLabel} />
        </Field>
      </form>
    </Dialog>
  );
}

export function RenameDialog() {
  const { t } = useTranslation();
  const state = useUi((s) => s.dialogs.rename);
  const close = () => useUi.getState().closeDialog("rename");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state) {
      setName(state.name);
      setError(null);
    }
  }, [state]);

  const submit = async () => {
    if (!state) return;
    setBusy(true);
    try {
      await api.rename(state.id, name);
      invalidateLibrary(true);
      toast.success(t("toast.renamed"));
      close();
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!state}
      onOpenChange={(o) => !o && close()}
      title={t("common.rename")}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => void submit()}>
            {t("common.rename")}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Input autoFocus value={name} maxLength={150} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} aria-label={t("common.rename")} />
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      </form>
    </Dialog>
  );
}

export function ExportDialog() {
  const { t } = useTranslation();
  const state = useUi((s) => s.dialogs.export);
  const close = () => useUi.getState().closeDialog("export");
  const settings = useSettings();
  const update = useUpdateSettings();
  const [format, setFormat] = useState(settings.exportFormat);
  const [quality, setQuality] = useState(settings.exportQuality);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state) {
      setFormat(settings.exportFormat);
      setQuality(settings.exportQuality);
    }
  }, [state, settings.exportFormat, settings.exportQuality]);

  const submit = async () => {
    if (!state) return;
    setBusy(true);
    try {
      void update({ exportFormat: format, exportQuality: quality });
      const res = state.collectionId
        ? await api.exportCollection(state.collectionId, format, quality)
        : await api.exportScreenshots(state.ids, format, quality);
      close();
      if (res.failed) toast.error(t("toast.importFailed", { count: res.failed }));
      toast.success(t("toast.exported", { count: res.exported }));
    } catch (e) {
      if (!isCancelled(e)) toast.error(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  };

  const count = state?.collectionId ? null : state?.ids.length ?? 0;
  return (
    <Dialog
      open={!!state}
      onOpenChange={(o) => !o && close()}
      title={state?.collectionId ? t("collections.exportAll") : t("common.export")}
      description={count ? t("format.screenshots", { count }) : undefined}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            {t("common.export")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t("settings.capture.format")}>
          <Segmented
            value={format}
            onChange={setFormat}
            options={[
              { value: "png", label: "PNG" },
              { value: "jpg", label: "JPG" },
              { value: "webp", label: "WEBP" },
            ]}
          />
        </Field>
        {format !== "png" ? (
          <Field label={`${t("settings.capture.quality")} · ${quality}%`}>
            <Slider value={quality} min={10} max={100} onChange={setQuality} label={t("settings.capture.quality")} />
          </Field>
        ) : null}
      </div>
    </Dialog>
  );
}

export function ConfirmDialog() {
  const { t } = useTranslation();
  const state = useUi((s) => s.dialogs.confirm);
  const done = (ok: boolean) => {
    state?.resolve(ok);
    useUi.getState().closeDialog("confirm");
  };
  return (
    <Dialog
      open={!!state}
      onOpenChange={(o) => !o && done(false)}
      title={state?.title ?? ""}
      description={state?.description}
      width="sm"
      icon={
        state?.danger ? (
          <span className="flex size-9 items-center justify-center rounded-xl bg-danger-soft text-danger">
            <AlertTriangle className="size-4.5" />
          </span>
        ) : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => done(false)}>
            {t("common.cancel")}
          </Button>
          <Button autoFocus variant={state?.danger ? "danger" : "primary"} onClick={() => done(true)}>
            {state?.confirmLabel}
          </Button>
        </>
      }
    />
  );
}

export function GlobalDialogs() {
  return (
    <>
      <CollectionDialog />
      <TagDialog />
      <RenameDialog />
      <ExportDialog />
      <ConfirmDialog />
    </>
  );
}
