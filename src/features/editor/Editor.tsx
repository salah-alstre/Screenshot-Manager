import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  ClipboardCopy,
  Copy as CopyIcon,
  FileDown,
  Maximize2,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Scaling,
  ShieldAlert,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { Dropdown } from "@/components/ui/Menu";
import { Input, Switch } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/feedback";
import { WindowControls } from "@/components/layout/WindowControls";
import { useScreenshot } from "@/hooks/useData";
import { useElementSize } from "@/hooks/useElementSize";
import { useSettings } from "@/hooks/useSettings";
import { api, type EditSaveMode } from "@/services/api";
import { errorMessage } from "@/services/errors";
import { invalidateLibrary } from "@/services/queryClient";
import { imageUrl } from "@/services/urls";
import { toast } from "@/stores/toast";
import { confirm, useUi } from "@/stores/ui";
import { isTypingTarget } from "@/utils/keys";
import { PropertiesPanel, ToolRail, TOOL_KEYS, type ToolProps } from "./EditorPanels";
import { clampRect, handlesFor, nextMarkerNumber, normRect, pick, rectHandles, resizeRect, shapeBounds, translate, type Handle } from "./geometry";
import { newId, type Doc, type Pt, type Rect, type Shape, type Tool } from "./model";
import { canvasToPng, createCanvas, cropCanvas, flatten, measureText, pickColor, renderDoc, resizeCanvas, rotateCanvas } from "./render";
import { useHistory } from "./useHistory";

type Gesture =
  | { kind: "draw"; shape: Shape; origin: Pt }
  | { kind: "move"; id: string; origin: Pt; startShapes: Shape[] }
  | { kind: "resize"; id: string; handle: Handle; startShapes: Shape[] }
  | { kind: "erase"; removed: Set<string> }
  | { kind: "crop"; mode: "new" | "move" | Handle; origin: Pt; start: Rect };

const DEFAULT_PROPS: ToolProps = {
  color: "#ef4444",
  width: 4,
  opacity: 1,
  fill: false,
  fontSize: 28,
  fontFamily: '"Inter Variable", "IBM Plex Sans Arabic", sans-serif',
  align: "start",
  background: false,
  markerSize: 36,
  redactMode: "blur",
  strength: 14,
};

function snap45(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y;
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.hypot(dx, dy);
  return { x: a.x + Math.cos(angle) * len, y: a.y + Math.sin(angle) * len };
}

function squareFrom(a: Pt, b: Pt): Pt {
  const s = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  return { x: a.x + Math.sign(b.x - a.x || 1) * s, y: a.y + Math.sign(b.y - a.y || 1) * s };
}

export function Editor() {
  const id = useUi((s) => s.editorId);
  if (id === null) return null;
  return <EditorInner key={id} id={id} />;
}

function EditorInner({ id }: { id: number }) {
  const { t } = useTranslation();
  const settings = useSettings();
  const closeEditor = useUi((s) => s.closeEditor);
  const { data: shot } = useScreenshot(id);
  const history = useHistory<Doc>(null);
  const doc = history.current;
  const [loadError, setLoadError] = useState(false);
  const [tool, setTool] = useState<Tool>("arrow");
  const [props, setProps] = useState<ToolProps>(DEFAULT_PROPS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [live, setLive] = useState<Shape[] | null>(null);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [textEdit, setTextEdit] = useState<{ id: string | null; x: number; y: number; value: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitted, setFitted] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resizeOpen, setResizeOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const stageSize = useElementSize(stageRef);

  // Load the current image into a canvas (CORS-enabled so it can be exported).
  const loadedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!shot || loadedFor.current === shot.id) return;
    loadedFor.current = shot.id;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = createCanvas(img.naturalWidth, img.naturalHeight);
      c.getContext("2d")!.drawImage(img, 0, 0);
      history.reset({ base: c, shapes: [] });
    };
    img.onerror = () => setLoadError(true);
    img.src = imageUrl(shot.id, shot.imageVersion);
  }, [shot, history]);

  const shapes = live ?? doc?.shapes ?? [];
  const selected = shapes.find((s) => s.id === selectedId) ?? null;
  const fitZoom = useMemo(() => {
    if (!doc || !stageSize.width) return 1;
    return Math.min((stageSize.width - 64) / doc.base.width, (stageSize.height - 64) / doc.base.height, 1);
  }, [doc, stageSize.width, stageSize.height]);

  useEffect(() => {
    if (fitted) setZoom(fitZoom);
  }, [fitZoom, fitted]);

  // Render on every change, coalesced into one frame.
  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (!canvasRef.current) return;
      renderDoc(canvasRef.current, { base: doc.base, shapes: draft ? [...shapes, draft] : shapes }, textEdit?.id ?? null);
    });
    return () => cancelAnimationFrame(frame);
  }, [doc, shapes, draft, textEdit]);

  const editing = textEdit !== null;
  useEffect(() => {
    if (!editing) return;
    const id = setTimeout(() => textRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [editing]);

  const commitShapes = useCallback(
    (next: Shape[]) => {
      if (!doc) return;
      history.push({ base: doc.base, shapes: next });
      setLive(null);
    },
    [doc, history],
  );

  const toImage = (e: { clientX: number; clientY: number }): Pt => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };
  const tol = 6 / zoom;

  const styleFor = (kind: Tool) => ({
    color: props.color,
    width: kind === "highlighter" ? Math.max(props.width, 12) : props.width,
    opacity: kind === "highlighter" ? Math.min(props.opacity, 0.45) : props.opacity,
  });

  const selectTool = (next: Tool) => {
    if (next === "crop" && doc) setCrop({ x: 0, y: 0, w: doc.base.width, h: doc.base.height });
    else setCrop(null);
    if (next !== "select") setSelectedId(null);
    if (next === "highlighter" && props.color === DEFAULT_PROPS.color) setProps((p) => ({ ...p, color: "#facc15", width: 20, opacity: 0.4 }));
    setTool(next);
  };

  // Changing a property also restyles the selected annotation.
  const changeProps = (patch: Partial<ToolProps>) => {
    setProps((p) => ({ ...p, ...patch }));
    if (!selected || !doc) return;
    const s = selected;
    let updated: Shape = s;
    if (s.kind === "text") {
      updated = {
        ...s,
        color: patch.color ?? s.color,
        opacity: patch.opacity ?? s.opacity,
        fontSize: patch.fontSize ?? s.fontSize,
        fontFamily: patch.fontFamily ?? s.fontFamily,
        align: patch.align ?? s.align,
        background: patch.background ?? s.background,
      };
    } else if (s.kind === "marker") {
      updated = { ...s, color: patch.color ?? s.color, opacity: patch.opacity ?? s.opacity, size: patch.markerSize ?? s.size };
    } else if (s.kind === "redact") {
      updated = { ...s, mode: patch.redactMode ?? s.mode, strength: patch.strength ?? s.strength };
    } else {
      updated = {
        ...s,
        style: { color: patch.color ?? s.style.color, width: patch.width ?? s.style.width, opacity: patch.opacity ?? s.style.opacity },
        ...(s.kind === "rect" || s.kind === "ellipse" ? { fill: patch.fill ?? s.fill } : {}),
      } as Shape;
    }
    commitShapes(doc.shapes.map((x) => (x.id === s.id ? updated : x)));
  };

  const selectShape = (s: Shape | null) => {
    setSelectedId(s?.id ?? null);
    if (!s) return;
    if (s.kind === "text")
      setProps((p) => ({ ...p, color: s.color, opacity: s.opacity, fontSize: s.fontSize, fontFamily: s.fontFamily, align: s.align, background: s.background }));
    else if (s.kind === "marker") setProps((p) => ({ ...p, color: s.color, opacity: s.opacity, markerSize: s.size }));
    else if (s.kind === "redact") setProps((p) => ({ ...p, redactMode: s.mode, strength: s.strength }));
    else setProps((p) => ({ ...p, color: s.style.color, width: s.style.width, opacity: s.style.opacity, ...(s.kind === "rect" || s.kind === "ellipse" ? { fill: s.fill } : {}) }));
  };

  const commitText = useCallback(() => {
    if (!textEdit || !doc) return;
    const value = textEdit.value.replace(/\s+$/, "");
    const existing = textEdit.id ? doc.shapes.find((s) => s.id === textEdit.id) : undefined;
    if (!value) {
      if (existing) commitShapes(doc.shapes.filter((s) => s.id !== existing.id));
    } else if (existing && existing.kind === "text") {
      commitShapes(doc.shapes.map((s) => (s.id === existing.id ? { ...existing, text: value } : s)));
    } else {
      const shape: Shape = {
        id: newId(),
        kind: "text",
        x: textEdit.x,
        y: textEdit.y,
        text: value,
        color: props.color,
        opacity: props.opacity,
        fontSize: props.fontSize,
        fontFamily: props.fontFamily,
        align: props.align,
        background: props.background,
      };
      commitShapes([...doc.shapes, shape]);
    }
    setTextEdit(null);
  }, [textEdit, doc, props, commitShapes]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!doc || e.button !== 0) return;
    if (textEdit) {
      commitText();
      return;
    }
    const p = toImage(e);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    switch (tool) {
      case "select": {
        if (selected) {
          const h = handlesFor(selected, measureText).find((hd) => Math.hypot(hd.x - p.x, hd.y - p.y) <= 8 / zoom);
          if (h) {
            gesture.current = { kind: "resize", id: selected.id, handle: h.id, startShapes: doc.shapes };
            return;
          }
        }
        const hit = pick(doc.shapes, p, tol, measureText);
        selectShape(hit ?? null);
        if (hit) gesture.current = { kind: "move", id: hit.id, origin: p, startShapes: doc.shapes };
        return;
      }
      case "crop": {
        const r = crop ?? { x: 0, y: 0, w: doc.base.width, h: doc.base.height };
        const h = rectHandles(r).find((hd) => Math.hypot(hd.x - p.x, hd.y - p.y) <= 10 / zoom);
        const inside = p.x > r.x && p.y > r.y && p.x < r.x + r.w && p.y < r.y + r.h;
        gesture.current = { kind: "crop", mode: h ? h.id : inside ? "move" : "new", origin: p, start: r };
        return;
      }
      case "eyedropper":
        if (canvasRef.current) setProps((s) => ({ ...s, color: pickColor(canvasRef.current!, p.x, p.y) }));
        return;
      case "text": {
        // Keep the upcoming mouseup/click from pulling focus away from the new text box.
        e.preventDefault();
        const hit = pick(doc.shapes, p, tol, measureText);
        if (hit && hit.kind === "text") {
          selectShape(hit);
          setTextEdit({ id: hit.id, x: hit.x, y: hit.y, value: hit.text });
        } else {
          setTextEdit({ id: null, x: p.x, y: p.y - props.fontSize * 0.6, value: "" });
        }
        return;
      }
      case "marker": {
        const shape: Shape = { id: newId(), kind: "marker", x: p.x, y: p.y, n: nextMarkerNumber(doc.shapes), color: props.color, size: props.markerSize, opacity: props.opacity };
        commitShapes([...doc.shapes, shape]);
        return;
      }
      case "eraser": {
        const removed = new Set<string>();
        const hit = pick(doc.shapes, p, tol * 2, measureText);
        if (hit) removed.add(hit.id);
        gesture.current = { kind: "erase", removed };
        setLive(doc.shapes.filter((s) => !removed.has(s.id)));
        return;
      }
      default: {
        let shape: Shape;
        if (tool === "pen" || tool === "highlighter") shape = { id: newId(), kind: tool, pts: [p], style: styleFor(tool) };
        else if (tool === "rect" || tool === "ellipse") shape = { id: newId(), kind: tool, x: p.x, y: p.y, w: 0, h: 0, style: styleFor(tool), fill: props.fill };
        else if (tool === "line" || tool === "arrow") shape = { id: newId(), kind: tool, a: p, b: p, style: styleFor(tool) };
        else shape = { id: newId(), kind: "redact", x: p.x, y: p.y, w: 0, h: 0, mode: props.redactMode, strength: props.strength };
        gesture.current = { kind: "draw", shape, origin: p };
        setDraft(shape);
      }
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g || !doc) return;
    const p = toImage(e);
    if (g.kind === "draw") {
      const s = g.shape;
      let next: Shape = s;
      if (s.kind === "pen" || s.kind === "highlighter") {
        const last = s.pts[s.pts.length - 1]!;
        if (Math.hypot(p.x - last.x, p.y - last.y) < 1.5 / zoom) return;
        next = { ...s, pts: [...s.pts, p] };
      } else if (s.kind === "line" || s.kind === "arrow") {
        next = { ...s, b: e.shiftKey ? snap45(s.a, p) : p };
      } else if (s.kind === "rect" || s.kind === "ellipse" || s.kind === "redact") {
        const r = normRect(g.origin, e.shiftKey ? squareFrom(g.origin, p) : p);
        next = { ...s, ...r };
      }
      g.shape = next;
      setDraft(next);
    } else if (g.kind === "move") {
      const dx = p.x - g.origin.x, dy = p.y - g.origin.y;
      setLive(g.startShapes.map((s) => (s.id === g.id ? translate(s, dx, dy) : s)));
    } else if (g.kind === "resize") {
      setLive(
        g.startShapes.map((s) => {
          if (s.id !== g.id) return s;
          if ((s.kind === "line" || s.kind === "arrow") && (g.handle === "a" || g.handle === "b")) return { ...s, [g.handle]: p };
          if (s.kind === "rect" || s.kind === "ellipse" || s.kind === "redact") return { ...s, ...resizeRect(shapeBounds(s), g.handle, p) };
          return s;
        }),
      );
    } else if (g.kind === "erase") {
      const hit = pick((live ?? doc.shapes), p, tol * 2, measureText);
      if (hit && !g.removed.has(hit.id)) {
        g.removed.add(hit.id);
        setLive(doc.shapes.filter((s) => !g.removed.has(s.id)));
      }
    } else if (g.kind === "crop") {
      const W = doc.base.width, H = doc.base.height;
      let r: Rect;
      if (g.mode === "new") r = normRect(g.origin, p);
      else if (g.mode === "move") {
        const dx = p.x - g.origin.x, dy = p.y - g.origin.y;
        r = { ...g.start, x: Math.min(Math.max(0, g.start.x + dx), W - g.start.w), y: Math.min(Math.max(0, g.start.y + dy), H - g.start.h) };
      } else r = resizeRect(g.start, g.mode, p);
      setCrop(clampRect(r, W, H));
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !doc) return;
    if (g.kind === "draw") {
      setDraft(null);
      const s = g.shape;
      const tiny =
        ((s.kind === "rect" || s.kind === "ellipse" || s.kind === "redact") && (s.w < 3 || s.h < 3)) ||
        ((s.kind === "line" || s.kind === "arrow") && Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) < 3);
      if (!tiny) commitShapes([...doc.shapes, s]);
    } else if ((g.kind === "move" || g.kind === "resize" || g.kind === "erase") && live) {
      const changed = live.length !== doc.shapes.length || live.some((s, i) => s !== doc.shapes[i]);
      if (changed) commitShapes(live);
      else setLive(null);
    }
  };

  const applyGeometry = (fn: (flat: HTMLCanvasElement) => HTMLCanvasElement) => {
    if (!doc) return;
    history.push({ base: fn(flatten(doc)), shapes: [] });
    setSelectedId(null);
    setFitted(true);
  };

  const applyCrop = () => {
    if (!crop || crop.w < 2 || crop.h < 2) return;
    const r = { x: Math.round(crop.x), y: Math.round(crop.y), w: Math.round(crop.w), h: Math.round(crop.h) };
    applyGeometry((flat) => cropCanvas(flat, r));
    setCrop(null);
    setTool("select");
  };

  const deleteSelected = () => {
    if (!doc || !selectedId) return;
    commitShapes(doc.shapes.filter((s) => s.id !== selectedId));
    setSelectedId(null);
  };

  const requestClose = useCallback(async () => {
    if (history.dirty) {
      const ok = await confirm({ title: t("editor.unsavedTitle"), description: t("editor.unsavedDesc"), confirmLabel: t("editor.discard"), danger: true });
      if (!ok) return;
    }
    closeEditor();
  }, [history.dirty, closeEditor, t]);

  const render = async (): Promise<Uint8Array | null> => {
    if (!doc) return null;
    if (textEdit) commitText();
    return canvasToPng(flatten(doc));
  };

  const save = async (mode: EditSaveMode) => {
    if (!doc || !shot) return;
    if (mode === "replace") {
      const ok = await confirm({ title: t("editor.replaceTitle"), description: t("editor.replaceDesc"), confirmLabel: t("editor.saveReplace"), danger: true });
      if (!ok) return;
    }
    setSaving(true);
    try {
      const png = await render();
      if (!png) return;
      const newId = await api.saveEdit(shot.id, png, mode);
      history.markSaved();
      invalidateLibrary(true);
      toast.success(mode === "copy" ? t("editor.savedCopy") : t("editor.saved"));
      closeEditor();
      if (mode === "copy") useUi.getState().openViewer({ id: newId, query: null, index: 0 });
    } catch (e) {
      toast.error(errorMessage(t, e));
    } finally {
      setSaving(false);
    }
  };

  const copyImage = async () => {
    try {
      const png = await render();
      if (png) await api.copyPng(png);
      toast.success(t("toast.copied"));
    } catch (e) {
      toast.error(errorMessage(t, e));
    }
  };

  const exportImage = async () => {
    if (!shot) return;
    try {
      const png = await render();
      if (png) await api.exportPng(png, shot.name, settings.exportFormat, settings.exportQuality);
      toast.success(t("toast.exported", { count: 1 }));
    } catch (e) {
      if ((e as { code?: string })?.code !== "cancelled") toast.error(errorMessage(t, e));
    }
  };

  const reset = async () => {
    if (!history.first) return;
    const ok = await confirm({ title: t("editor.resetTitle"), description: t("editor.resetDesc"), confirmLabel: t("editor.reset"), danger: true });
    if (ok) {
      history.push(history.first);
      setSelectedId(null);
      setFitted(true);
    }
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUi.getState();
      if (ui.paletteOpen || Object.values(ui.dialogs).some(Boolean) || resizeOpen) return;
      if (isTypingTarget(e.target)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
        setSelectedId(null);
      } else if (ctrl && e.code === "KeyY") {
        e.preventDefault();
        history.redo();
      } else if (ctrl && e.code === "KeyS") {
        e.preventDefault();
        void save("keep");
      } else if (ctrl && e.code === "KeyC") {
        e.preventDefault();
        void copyImage();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (tool === "crop") selectTool("select");
        else if (selectedId) setSelectedId(null);
        else void requestClose();
      } else if (e.key === "Enter" && tool === "crop") {
        applyCrop();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        deleteSelected();
      } else if (e.key === "+" || e.key === "=") {
        setFitted(false);
        setZoom((z) => Math.min(8, z * 1.25));
      } else if (e.key === "-") {
        setFitted(false);
        setZoom((z) => Math.max(0.05, z / 1.25));
      } else if (e.key === "0") {
        setFitted(true);
      } else if (!ctrl && !e.altKey) {
        const key = e.code.startsWith("Key") ? e.code.slice(3) : "";
        const found = (Object.entries(TOOL_KEYS) as [Tool, string][]).find(([, k]) => k === key);
        if (found) selectTool(found[0]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const panelKind = selected ? (selected.kind === "redact" ? "redact" : selected.kind) : tool === "select" || tool === "crop" || tool === "eraser" || tool === "eyedropper" ? null : tool;
  const hint = tool === "eyedropper" ? t("editor.eyedropperHint") : tool === "eraser" ? t("editor.eraserHint") : tool === "crop" ? t("editor.crop.hint") : undefined;

  const W = doc?.base.width ?? 0;
  const H = doc?.base.height ?? 0;
  const handleSize = 9 / zoom;
  const selBounds = selected ? shapeBounds(selected, measureText) : null;
  const editingShape = textEdit?.id ? doc?.shapes.find((s) => s.id === textEdit.id) : undefined;
  const textStyle = editingShape && editingShape.kind === "text" ? editingShape : { ...props, color: props.color };

  const cursor =
    tool === "select" ? "default" : tool === "text" ? "text" : tool === "eyedropper" ? "copy" : tool === "eraser" ? "cell" : "crosshair";

  return (
    <div className="fixed inset-0 z-[55] flex animate-fade-in flex-col bg-bg" role="dialog" aria-modal="true" aria-label={t("editor.title")}>
      <header className="drag-region flex h-12 shrink-0 items-center gap-2 border-b border-border ps-3">
        <IconButton label={t("editor.close")} shortcut="Esc" className="no-drag" onClick={() => void requestClose()}>
          <X className="size-4" />
        </IconButton>
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-[0.8125rem] font-semibold text-fg">
            {t("editor.title")}
            <span className="font-normal text-fg-muted"> · {shot?.name}</span>
          </p>
          {doc ? (
            <p className="text-[0.6875rem] text-fg-subtle tabular-nums" dir="ltr">
              {W} × {H}
            </p>
          ) : null}
        </div>
        <div className="no-drag flex items-center gap-0.5">
          <IconButton label={t("editor.undo")} shortcut="Ctrl+Z" disabled={!history.canUndo} onClick={() => { history.undo(); setSelectedId(null); }}>
            <Undo2 className="flip-rtl size-4" />
          </IconButton>
          <IconButton label={t("editor.redo")} shortcut="Ctrl+Y" disabled={!history.canRedo} onClick={() => { history.redo(); setSelectedId(null); }}>
            <Redo2 className="flip-rtl size-4" />
          </IconButton>
          <div className="mx-1 h-5 w-px bg-border" />
          <IconButton label={t("editor.rotateLeft")} disabled={!doc} onClick={() => applyGeometry((f) => rotateCanvas(f, -1))}>
            <RotateCcw className="size-4" />
          </IconButton>
          <IconButton label={t("editor.rotateRight")} disabled={!doc} onClick={() => applyGeometry((f) => rotateCanvas(f, 1))}>
            <RotateCw className="size-4" />
          </IconButton>
          <IconButton label={t("editor.resize")} disabled={!doc} onClick={() => setResizeOpen(true)}>
            <Scaling className="size-4" />
          </IconButton>
          <IconButton label={t("editor.reset")} disabled={!history.canUndo} onClick={() => void reset()}>
            <History className="size-4" />
          </IconButton>
          <div className="mx-1 h-5 w-px bg-border" />
          <div className="flex items-center rounded-lg border border-border bg-surface px-0.5">
            <IconButton size="sm" label={t("editor.zoomOut")} shortcut="-" onClick={() => { setFitted(false); setZoom((z) => Math.max(0.05, z / 1.25)); }}>
              <ZoomOut className="size-4" />
            </IconButton>
            <span className="w-11 text-center text-xs text-fg-muted tabular-nums">{Math.round(zoom * 100)}%</span>
            <IconButton size="sm" label={t("editor.zoomIn")} shortcut="+" onClick={() => { setFitted(false); setZoom((z) => Math.min(8, z * 1.25)); }}>
              <ZoomIn className="size-4" />
            </IconButton>
            <IconButton size="sm" label={t("editor.fit")} shortcut="0" onClick={() => setFitted(true)}>
              <Maximize2 className="size-3.5" />
            </IconButton>
          </div>
          <div className="mx-1 h-5 w-px bg-border" />
          <IconButton label={t("editor.copyImage")} shortcut="Ctrl+C" disabled={!doc} onClick={() => void copyImage()}>
            <ClipboardCopy className="size-4" />
          </IconButton>
          <IconButton label={t("editor.exportFile")} disabled={!doc} onClick={() => void exportImage()}>
            <FileDown className="size-4" />
          </IconButton>
          <div className="ms-1 inline-flex">
            <Button variant="primary" className="rounded-e-none" icon={<Save className="size-4" />} loading={saving} disabled={!doc} onClick={() => void save("keep")}>
              {t("editor.save")}
            </Button>
            <Dropdown.Root>
              <Dropdown.Trigger asChild>
                <button type="button" aria-label={t("common.more")} disabled={!doc || saving} className="inline-flex h-8.5 w-7 items-center justify-center rounded-e-lg border-s border-white/20 bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50">
                  <ChevronDown className="size-4" />
                </button>
              </Dropdown.Trigger>
              <Dropdown.Content className="w-80">
                <Dropdown.Radio checked={false} icon={<Check className="size-4" />} description={t("editor.saveKeepDesc")} onSelect={() => void save("keep")}>
                  {t("editor.saveKeep")}
                </Dropdown.Radio>
                <Dropdown.Radio checked={false} icon={<CopyIcon className="size-4" />} description={t("editor.saveCopyDesc")} onSelect={() => void save("copy")}>
                  {t("editor.saveCopy")}
                </Dropdown.Radio>
                <Dropdown.Separator />
                <Dropdown.Radio checked={false} icon={<ShieldAlert className="size-4 text-danger" />} description={t("editor.saveReplaceDesc")} onSelect={() => void save("replace")}>
                  {t("editor.saveReplace")}
                </Dropdown.Radio>
              </Dropdown.Content>
            </Dropdown.Root>
          </div>
        </div>
        <WindowControls className="h-12" />
      </header>

      <div className="flex min-h-0 flex-1">
        <ToolRail tool={tool} onTool={selectTool} />
        <div
          ref={stageRef}
          className="checkerboard relative min-w-0 flex-1 overflow-auto"
          onWheel={(e) => {
            if (!e.ctrlKey) return;
            setFitted(false);
            setZoom((z) => Math.min(8, Math.max(0.05, z * Math.exp(-e.deltaY * 0.0015))));
          }}
        >
          {!doc ? (
            <div className="flex size-full items-center justify-center p-12">
              {loadError ? <p className="text-fg-muted">{t("errors.imageFailed")}</p> : <Skeleton className="aspect-video w-2/3 rounded-xl" />}
            </div>
          ) : (
            <div className="flex min-h-full min-w-full items-center justify-center p-8" style={{ width: "max-content", height: "max-content" }}>
              <div
                className="relative shadow-pop"
                style={{ width: W * zoom, height: H * zoom, cursor, touchAction: "none", direction: "ltr" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDoubleClick={(e) => {
                  if (tool !== "select" || !doc) return;
                  const hit = pick(doc.shapes, toImage(e), tol, measureText);
                  if (hit?.kind === "text") setTextEdit({ id: hit.id, x: hit.x, y: hit.y, value: hit.text });
                }}
              >
                <canvas ref={canvasRef} className="block size-full" style={{ imageRendering: zoom >= 2 ? "pixelated" : "auto" }} />
                <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                  {selBounds && tool === "select" && !textEdit ? (
                    <>
                      <rect
                        x={selBounds.x - 4 / zoom}
                        y={selBounds.y - 4 / zoom}
                        width={selBounds.w + 8 / zoom}
                        height={selBounds.h + 8 / zoom}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth={1.5 / zoom}
                        strokeDasharray={`${5 / zoom} ${4 / zoom}`}
                      />
                      {handlesFor(selected!, measureText).map((h) => (
                        <rect key={h.id} x={h.x - handleSize / 2} y={h.y - handleSize / 2} width={handleSize} height={handleSize} rx={2 / zoom} fill="white" stroke="var(--accent)" strokeWidth={1.5 / zoom} />
                      ))}
                    </>
                  ) : null}
                  {tool === "crop" && crop ? (
                    <>
                      <path
                        d={`M0 0H${W}V${H}H0Z M${crop.x} ${crop.y}V${crop.y + crop.h}H${crop.x + crop.w}V${crop.y}Z`}
                        fill="rgba(0,0,0,0.55)"
                        fillRule="evenodd"
                      />
                      <rect x={crop.x} y={crop.y} width={crop.w} height={crop.h} fill="none" stroke="white" strokeWidth={1.5 / zoom} />
                      {[1, 2].map((i) => (
                        <g key={i} stroke="rgba(255,255,255,0.35)" strokeWidth={1 / zoom}>
                          <line x1={crop.x + (crop.w * i) / 3} y1={crop.y} x2={crop.x + (crop.w * i) / 3} y2={crop.y + crop.h} />
                          <line x1={crop.x} y1={crop.y + (crop.h * i) / 3} x2={crop.x + crop.w} y2={crop.y + (crop.h * i) / 3} />
                        </g>
                      ))}
                      {rectHandles(crop).map((h) => (
                        <rect key={h.id} x={h.x - handleSize / 2} y={h.y - handleSize / 2} width={handleSize} height={handleSize} fill="white" stroke="var(--accent)" strokeWidth={1.5 / zoom} />
                      ))}
                    </>
                  ) : null}
                </svg>
                {textEdit ? (
                  <textarea
                    ref={textRef}
                    dir="auto"
                    value={textEdit.value}
                    placeholder={t("editor.textPlaceholder")}
                    onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Escape") setTextEdit(null);
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) commitText();
                    }}
                    onBlur={commitText}
                    rows={Math.max(1, textEdit.value.split("\n").length)}
                    className="absolute min-w-40 resize-none overflow-hidden border border-dashed border-accent bg-transparent p-0 leading-[1.3] font-semibold outline-none"
                    style={{
                      left: textEdit.x * zoom,
                      top: textEdit.y * zoom,
                      fontSize: textStyle.fontSize * zoom,
                      fontFamily: textStyle.fontFamily,
                      color: textStyle.color,
                      width: Math.max(160, (measureText({ ...(editingShape?.kind === "text" ? editingShape : { id: "", kind: "text", x: 0, y: 0, color: props.color, opacity: 1, fontSize: props.fontSize, fontFamily: props.fontFamily, align: props.align, background: false }), text: textEdit.value || "M" }).w + props.fontSize) * zoom),
                    }}
                  />
                ) : null}
              </div>
            </div>
          )}
          {tool === "crop" && crop ? (
            <div className="glass sticky bottom-5 z-10 mx-auto flex w-max animate-slide-up items-center gap-2 rounded-xl border border-border p-1.5 shadow-pop">
              <span className="px-2 text-xs text-fg-muted tabular-nums" dir="ltr">
                {Math.round(crop.w)} × {Math.round(crop.h)}
              </span>
              <Button size="sm" variant="ghost" onClick={() => selectTool("select")}>
                {t("editor.crop.cancel")}
              </Button>
              <Button size="sm" variant="primary" onClick={applyCrop}>
                {t("editor.crop.apply")}
              </Button>
            </div>
          ) : null}
        </div>
        <PropertiesPanel
          kind={panelKind}
          props={props}
          onChange={changeProps}
          nextNumber={doc ? nextMarkerNumber(doc.shapes) : 1}
          hasSelection={!!selected && tool === "select"}
          onDeleteSelected={deleteSelected}
          hint={hint}
        />
      </div>

      {doc ? (
        <ResizeDialog
          open={resizeOpen}
          onOpenChange={setResizeOpen}
          width={W}
          height={H}
          onApply={(w, h) => {
            applyGeometry((f) => resizeCanvas(f, w, h));
            setResizeOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function ResizeDialog({
  open,
  onOpenChange,
  width,
  height,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  width: number;
  height: number;
  onApply: (w: number, h: number) => void;
}) {
  const { t } = useTranslation();
  const [w, setW] = useState(width);
  const [h, setH] = useState(height);
  const [keep, setKeep] = useState(true);
  useEffect(() => {
    if (open) {
      setW(width);
      setH(height);
    }
  }, [open, width, height]);
  const ratio = width / height;
  const valid = w >= 1 && h >= 1 && w <= 16384 && h <= 16384;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("editor.resizeDialog.title")}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" disabled={!valid} onClick={() => onApply(Math.round(w), Math.round(h))}>
            {t("common.apply")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
            {t("editor.resizeDialog.width")}
            <Input
              type="number"
              min={1}
              value={w}
              onChange={(e) => {
                const v = Number(e.target.value);
                setW(v);
                if (keep) setH(Math.round(v / ratio));
              }}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
            {t("editor.resizeDialog.height")}
            <Input
              type="number"
              min={1}
              value={h}
              onChange={(e) => {
                const v = Number(e.target.value);
                setH(v);
                if (keep) setW(Math.round(v * ratio));
              }}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[25, 50, 75, 150, 200].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setW(Math.round((width * p) / 100));
                setH(Math.round((height * p) / 100));
              }}
              className="h-7 rounded-full border border-border px-2.5 text-xs text-fg-muted hover:border-accent hover:text-accent"
            >
              {p}%
            </button>
          ))}
        </div>
        <label className="flex items-center justify-between text-[0.8125rem] text-fg">
          {t("editor.resizeDialog.keepAspect")}
          <Switch checked={keep} onChange={setKeep} label={t("editor.resizeDialog.keepAspect")} />
        </label>
        <p className="text-xs text-fg-subtle">{t("editor.flattenNote")}</p>
      </div>
    </Dialog>
  );
}
