import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { ClipboardCopy, PencilLine, Save, X } from "lucide-react";
import { api } from "@/services/api";
import { overlayUrl } from "@/services/urls";
import { setLanguage } from "@/i18n";
import type { Rect, WindowInfo } from "@/types/models";
import { cn } from "@/utils/cn";

interface StartPayload {
  sessionId: number;
  mode: "region" | "window";
  width: number;
  height: number;
  monitors: Rect[];
  windows: WindowInfo[];
}

type Drag = { kind: "new"; x: number; y: number } | { kind: "move"; x: number; y: number; start: Rect } | { kind: "resize"; handle: string; start: Rect };

const win = getCurrentWindow();

function norm(ax: number, ay: number, bx: number, by: number): Rect {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

export function OverlayApp() {
  const { t } = useTranslation();
  const [session, setSession] = useState<StartPayload | null>(null);
  const [mode, setMode] = useState<"region" | "window">("region");
  const [sel, setSel] = useState<Rect | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [cursor, setCursor] = useState({ x: -100, y: -100 });
  const [hoverWin, setHoverWin] = useState<Rect | null>(null);
  const drag = useRef<Drag | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const finishing = useRef(false);

  // Frame pixels per CSS pixel.
  const scale = session ? session.width / window.innerWidth : 1;
  const toCss = useCallback((r: Rect): Rect => ({ x: r.x / scale, y: r.y / scale, w: r.w / scale, h: r.h / scale }), [scale]);

  useEffect(() => {
    const un = listen<StartPayload>("overlay-start", async (e) => {
      try {
        const s = await api.getSettings();
        document.documentElement.dataset.accent = s.accent;
        await setLanguage(s.language);
      } catch {
        /* keep defaults */
      }
      finishing.current = false;
      setSel(null);
      setConfirmed(false);
      setHoverWin(null);
      setMode(e.payload.mode);
      setSession(e.payload);
    });
    return () => void un.then((f) => f());
  }, []);

  const onImageLoad = async () => {
    await win.show();
    await win.setFocus();
  };

  const finish = useCallback(
    async (action: "save" | "copy" | "edit" | "cancel") => {
      if (!session || finishing.current) return;
      finishing.current = true;
      const rect = sel && action !== "cancel"
        ? { x: Math.round(sel.x * scale), y: Math.round(sel.y * scale), w: Math.round(sel.w * scale), h: Math.round(sel.h * scale) }
        : null;
      setSession(null);
      await api.overlayFinish(session.sessionId, action, rect);
    },
    [session, sel, scale],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!session) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (confirmed && sel) {
          setConfirmed(false);
          setSel(null);
        } else void finish("cancel");
      } else if (e.key === "Enter" && sel && sel.w > 2) void finish("save");
      else if (e.ctrlKey && e.code === "KeyC" && sel) void finish("copy");
      else if (e.code === "KeyE" && sel && confirmed) void finish("edit");
      else if (e.code === "KeyW" && !confirmed) setMode("window");
      else if (e.code === "KeyR" && !confirmed) setMode("region");
      else if (sel && confirmed && e.key.startsWith("Arrow")) {
        // Nudge the selection by one physical pixel (Shift: resize).
        e.preventDefault();
        const d = 1 / scale;
        const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
        const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
        setSel((s) => (s ? (e.shiftKey ? { ...s, w: Math.max(1, s.w + dx), h: Math.max(1, s.h + dy) } : { ...s, x: s.x + dx, y: s.y + dy }) : s));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, sel, confirmed, finish, scale]);

  // Magnifier: 11×11 physical pixels around the cursor, drawn 10× larger.
  useEffect(() => {
    const c = loupeRef.current;
    const img = imgRef.current;
    if (!c || !img || !img.complete || !session) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const n = 11;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    const px = Math.round(cursor.x * scale) - Math.floor(n / 2);
    const py = Math.round(cursor.y * scale) - Math.floor(n / 2);
    ctx.drawImage(img, px, py, n, n, 0, 0, c.width, c.height);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    const cell = c.width / n;
    for (let i = 1; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, c.height);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(c.width, i * cell);
      ctx.stroke();
    }
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.floor(n / 2) * cell, Math.floor(n / 2) * cell, cell, cell);
  }, [cursor, scale, session]);

  const windowAt = useCallback(
    (x: number, y: number): Rect | null => {
      if (!session) return null;
      const fx = x * scale;
      const fy = y * scale;
      const w = session.windows.find((w) => fx >= w.rect.x && fy >= w.rect.y && fx < w.rect.x + w.rect.w && fy < w.rect.y + w.rect.h);
      if (w) return toCss(w.rect);
      const m = session.monitors.find((r) => fx >= r.x && fy >= r.y && fx < r.x + r.w && fy < r.y + r.h);
      return m ? toCss(m) : null;
    },
    [session, scale, toCss],
  );

  const handleAt = (x: number, y: number): string | null => {
    if (!sel || !confirmed) return null;
    const pts: Record<string, [number, number]> = {
      nw: [sel.x, sel.y],
      n: [sel.x + sel.w / 2, sel.y],
      ne: [sel.x + sel.w, sel.y],
      e: [sel.x + sel.w, sel.y + sel.h / 2],
      se: [sel.x + sel.w, sel.y + sel.h],
      s: [sel.x + sel.w / 2, sel.y + sel.h],
      sw: [sel.x, sel.y + sel.h],
      w: [sel.x, sel.y + sel.h / 2],
    };
    for (const [k, [hx, hy]] of Object.entries(pts)) if (Math.abs(hx - x) <= 8 && Math.abs(hy - y) <= 8) return k;
    return null;
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || !session) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const { clientX: x, clientY: y } = e;
    const h = handleAt(x, y);
    if (h && sel) {
      drag.current = { kind: "resize", handle: h, start: sel };
      return;
    }
    if (sel && confirmed && x > sel.x && y > sel.y && x < sel.x + sel.w && y < sel.y + sel.h) {
      drag.current = { kind: "move", x, y, start: sel };
      return;
    }
    setConfirmed(false);
    drag.current = { kind: "new", x, y };
    setSel(null);
  };

  const onMove = (e: PointerEvent) => {
    const { clientX: x, clientY: y } = e;
    setCursor({ x, y });
    const d = drag.current;
    if (!d) {
      if (mode === "window" && !confirmed) setHoverWin(windowAt(x, y));
      return;
    }
    if (d.kind === "new") {
      if (Math.abs(x - d.x) > 3 || Math.abs(y - d.y) > 3) setSel(norm(d.x, d.y, x, y));
    } else if (d.kind === "move") {
      const W = window.innerWidth, H = window.innerHeight;
      setSel({
        ...d.start,
        x: Math.min(Math.max(0, d.start.x + x - d.x), W - d.start.w),
        y: Math.min(Math.max(0, d.start.y + y - d.y), H - d.start.h),
      });
    } else {
      const s = d.start;
      let x1 = s.x, y1 = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
      if (d.handle.includes("w")) x1 = x;
      if (d.handle.includes("e")) x2 = x;
      if (d.handle.includes("n")) y1 = y;
      if (d.handle.includes("s")) y2 = y;
      setSel(norm(x1, y1, x2, y2));
    }
  };

  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "new") {
      const moved = Math.abs(e.clientX - d.x) > 3 || Math.abs(e.clientY - d.y) > 3;
      if (!moved) {
        // A click: in window mode (or anywhere) pick the window under the cursor.
        const r = windowAt(e.clientX, e.clientY);
        if (r && (mode === "window" || !sel)) {
          const vw = window.innerWidth, vh = window.innerHeight;
          const clipped = { x: Math.max(0, r.x), y: Math.max(0, r.y), w: Math.min(r.w, vw - Math.max(0, r.x)), h: Math.min(r.h, vh - Math.max(0, r.y)) };
          setSel(clipped);
          setConfirmed(true);
          setHoverWin(null);
        }
        return;
      }
    }
    setConfirmed(true);
  };

  if (!session) return <div className="h-full bg-black" />;

  const dims = sel ? `${Math.round(sel.w * scale)} × ${Math.round(sel.h * scale)}` : null;
  const hole = sel ?? (mode === "window" ? hoverWin : null);
  const vw = window.innerWidth, vh = window.innerHeight;
  const toolbarBelow = sel ? sel.y + sel.h + 56 < vh : true;
  const loupeLeft = cursor.x + 150 > vw ? cursor.x - 140 : cursor.x + 24;
  const loupeTop = cursor.y + 170 > vh ? cursor.y - 160 : cursor.y + 24;

  return (
    <div
      className="relative h-full w-full overflow-hidden select-none"
      style={{ cursor: drag.current?.kind === "move" ? "move" : "crosshair" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onDoubleClick={() => sel && void finish("save")}
      onContextMenu={(e) => {
        e.preventDefault();
        void finish("cancel");
      }}
    >
      <img
        ref={imgRef}
        src={overlayUrl(session.sessionId)}
        alt=""
        crossOrigin="anonymous"
        draggable={false}
        onLoad={() => void onImageLoad()}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
      {/* Dimmed backdrop with a clear "hole" for the selection */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <mask id="hole">
            <rect width="100%" height="100%" fill="white" />
            {hole ? <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} fill="black" /> : null}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(6,8,14,0.5)" mask="url(#hole)" />
        {hole ? (
          <rect x={hole.x + 0.5} y={hole.y + 0.5} width={Math.max(0, hole.w - 1)} height={Math.max(0, hole.h - 1)} fill="none" stroke="var(--accent)" strokeWidth={sel ? 1.5 : 3} />
        ) : null}
        {!sel && !drag.current && mode === "region" ? (
          <g stroke="rgba(255,255,255,0.45)" strokeWidth="1" strokeDasharray="4 4">
            <line x1={cursor.x} y1={0} x2={cursor.x} y2="100%" />
            <line x1={0} y1={cursor.y} x2="100%" y2={cursor.y} />
          </g>
        ) : null}
      </svg>

      {sel && confirmed
        ? HANDLES.map((h) => {
            const hx = h.includes("w") ? sel.x : h.includes("e") ? sel.x + sel.w : sel.x + sel.w / 2;
            const hy = h.includes("n") ? sel.y : h.includes("s") ? sel.y + sel.h : sel.y + sel.h / 2;
            return <div key={h} className="pointer-events-none absolute size-2.5 rounded-sm border-[1.5px] border-accent bg-white" style={{ left: hx - 5, top: hy - 5 }} />;
          })
        : null}

      {dims && sel ? (
        <div
          dir="ltr"
          className="pointer-events-none absolute rounded-md bg-black/75 px-2 py-1 font-mono text-[11px] font-medium text-white shadow-lg"
          style={{ left: Math.min(sel.x, vw - 110), top: sel.y > 30 ? sel.y - 28 : sel.y + 6 }}
        >
          {dims}
        </div>
      ) : null}

      {!confirmed ? (
        <div className="pointer-events-none absolute" style={{ left: loupeLeft, top: loupeTop }}>
          <canvas ref={loupeRef} width={110} height={110} className="rounded-xl border-2 border-white/80 shadow-2xl" />
          <p dir="ltr" className="mt-1 rounded bg-black/70 px-1.5 py-0.5 text-center font-mono text-[10px] text-white">
            {Math.round(cursor.x * scale)}, {Math.round(cursor.y * scale)}
          </p>
        </div>
      ) : null}

      {!sel ? (
        <div className="pointer-events-none absolute top-6 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-[13px] text-white shadow-lg backdrop-blur">
          {mode === "window" ? t("capture.hintWindow") : t("capture.hintRegion")}
        </div>
      ) : null}

      {sel && confirmed ? (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className="absolute flex items-center gap-1 rounded-xl border border-white/10 bg-[#16181d]/90 p-1 text-white shadow-2xl backdrop-blur-xl"
          style={{
            left: Math.max(8, Math.min(sel.x + sel.w / 2 - 170, vw - 348)),
            top: toolbarBelow ? sel.y + sel.h + 10 : Math.max(8, sel.y - 50),
          }}
        >
          {(
            [
              ["save", <Save key="s" className="size-4" />, t("capture.save"), "Enter"],
              ["copy", <ClipboardCopy key="c" className="size-4" />, t("capture.copy"), "Ctrl+C"],
              ["edit", <PencilLine key="e" className="size-4" />, t("capture.edit"), "E"],
            ] as const
          ).map(([action, icon, label, key]) => (
            <button
              key={action}
              type="button"
              title={key}
              onClick={() => void finish(action)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
                action === "save" ? "bg-accent text-accent-fg hover:bg-accent-hover" : "hover:bg-white/10",
              )}
            >
              {icon}
              {label}
            </button>
          ))}
          <div className="mx-0.5 h-5 w-px bg-white/15" />
          <button type="button" title="Esc" aria-label={t("capture.cancel")} onClick={() => void finish("cancel")} className="flex size-8 items-center justify-center rounded-lg hover:bg-white/10">
            <X className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
