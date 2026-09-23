import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { useTranslation } from "react-i18next";
import { ImageOff } from "lucide-react";
import { useElementSize } from "@/hooks/useElementSize";
import type { OcrWord } from "@/types/models";

export interface StageHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  actual: () => void;
}

interface Props {
  src: string;
  width: number;
  height: number;
  alt: string;
  words?: OcrWord[];
  highlight?: (w: OcrWord) => boolean;
  onScaleChange?: (scale: number, fitted: boolean) => void;
}

const MIN = 0.05;
const MAX = 16;

/** Zoomable, pannable image. Wheel zooms around the cursor; drag pans; double-click toggles fit/100%. */
export const ImageStage = forwardRef<StageHandle, Props>(function ImageStage(
  { src, width, height, alt, words, highlight, onScaleChange },
  ref,
) {
  const { t } = useTranslation();
  const boxRef = useRef<HTMLDivElement>(null);
  const { width: cw, height: ch } = useElementSize(boxRef);
  const [view, setView] = useState({ s: 1, x: 0, y: 0, fitted: true });
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const fitView = useCallback(() => {
    if (!cw || !ch || !width || !height) return;
    const pad = 32;
    const s = Math.min((cw - pad) / width, (ch - pad) / height, 1);
    setView({ s, x: (cw - width * s) / 2, y: (ch - height * s) / 2, fitted: true });
  }, [cw, ch, width, height]);

  useEffect(() => {
    setStatus("loading");
  }, [src]);

  // A new image always starts fitted; container resizes refit only if the user hasn't zoomed.
  const fittedRef = useRef(true);
  fittedRef.current = view.fitted;
  const lastSrc = useRef(src);
  useEffect(() => {
    if (lastSrc.current !== src || fittedRef.current) fitView();
    lastSrc.current = src;
  }, [fitView, src]);

  useEffect(() => {
    onScaleChange?.(view.s, view.fitted);
  }, [view.s, view.fitted, onScaleChange]);

  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    setView((v) => {
      const s = Math.min(MAX, Math.max(MIN, v.s * factor));
      const cx = px ?? cw / 2;
      const cy = py ?? ch / 2;
      return { s, x: cx - (cx - v.x) * (s / v.s), y: cy - (cy - v.y) * (s / v.s), fitted: false };
    });
  }, [cw, ch]);

  const actual = useCallback(() => {
    setView({ s: 1, x: (cw - width) / 2, y: (ch - height) / 2, fitted: false });
  }, [cw, ch, width, height]);

  useImperativeHandle(ref, () => ({ zoomIn: () => zoomAt(1.25), zoomOut: () => zoomAt(0.8), fit: fitView, actual }), [zoomAt, fitView, actual]);

  const onWheel = (e: WheelEvent) => {
    const rect = boxRef.current!.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y, fitted: false }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const hits = highlight && words ? words.filter(highlight) : [];

  return (
    <div
      ref={boxRef}
      className="checkerboard relative size-full cursor-grab overflow-hidden active:cursor-grabbing"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={(e) => {
        if (view.fitted) {
          const rect = boxRef.current!.getBoundingClientRect();
          zoomAt(1 / view.s, e.clientX - rect.left, e.clientY - rect.top);
        } else fitView();
      }}
      style={{ direction: "ltr" }}
    >
      {status === "loading" ? <div className="skeleton absolute inset-8 rounded-lg opacity-60" /> : null}
      {status === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-fg-subtle">
          <ImageOff className="size-8" />
          <span className="text-sm">{t("errors.imageFailed")}</span>
        </div>
      ) : null}
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          width,
          height,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
          transition: drag.current ? "none" : "transform 120ms ease-out",
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setStatus("ok")}
          onError={() => setStatus("error")}
          className="block size-full shadow-pop select-none"
          style={{ imageRendering: view.s >= 2 ? "pixelated" : "auto", opacity: status === "ok" ? 1 : 0 }}
        />
        {hits.map((w, i) => (
          <div
            key={i}
            className="pointer-events-none absolute rounded-[2px] bg-fav/35 ring-2 ring-fav"
            style={{ left: w.x - 2, top: w.y - 2, width: w.w + 4, height: w.h + 4 }}
          />
        ))}
      </div>
    </div>
  );
});
