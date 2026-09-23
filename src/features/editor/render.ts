// Canvas rendering for the editor. Redactions sample the base image and are
// drawn as pixels, so exported files contain no recoverable original content.
import type { Doc, Rect, Shape } from "./model";
import { hasArabic } from "./geometry";

export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw new Error("2D canvas unavailable");
  return ctx;
}

const LINE_HEIGHT = 1.3;
const measureCanvas = typeof document !== "undefined" ? createCanvas(1, 1) : null;

export function measureText(s: Extract<Shape, { kind: "text" }>): { w: number; h: number } {
  const lines = s.text.split("\n");
  if (!measureCanvas) return { w: s.text.length * s.fontSize * 0.55, h: lines.length * s.fontSize * LINE_HEIGHT };
  const ctx = ctx2d(measureCanvas);
  ctx.font = `600 ${s.fontSize}px ${s.fontFamily}`;
  const w = Math.max(...lines.map((l) => ctx.measureText(l || " ").width));
  const pad = s.background ? s.fontSize * 0.35 : 0;
  return { w: w + pad * 2, h: lines.length * s.fontSize * LINE_HEIGHT + pad * 2 };
}

function smoothPath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  ctx.beginPath();
  if (pts.length === 1) {
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    ctx.lineTo(pts[0]!.x + 0.01, pts[0]!.y);
    return;
  }
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i]!.x + pts[i + 1]!.x) / 2;
    const my = (pts[i]!.y + pts[i + 1]!.y) / 2;
    ctx.quadraticCurveTo(pts[i]!.x, pts[i]!.y, mx, my);
  }
  const last = pts[pts.length - 1]!;
  ctx.lineTo(last.x, last.y);
}

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function drawRedaction(ctx: CanvasRenderingContext2D, base: HTMLCanvasElement, s: Extract<Shape, { kind: "redact" }>) {
  const r: Rect = { x: Math.round(s.x), y: Math.round(s.y), w: Math.round(s.w), h: Math.round(s.h) };
  if (r.w < 1 || r.h < 1) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  if (s.mode === "blackout") {
    ctx.fillStyle = "#0b0b0d";
    ctx.fillRect(r.x, r.y, r.w, r.h);
  } else if (s.mode === "pixelate") {
    const block = Math.max(4, Math.round(s.strength));
    const tw = Math.max(1, Math.ceil(r.w / block));
    const th = Math.max(1, Math.ceil(r.h / block));
    const tmp = createCanvas(tw, th);
    const t = ctx2d(tmp);
    t.imageSmoothingEnabled = true;
    t.drawImage(base, r.x, r.y, r.w, r.h, 0, 0, tw, th);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, tw, th, r.x, r.y, tw * block, th * block);
    ctx.imageSmoothingEnabled = true;
  } else {
    // Blur a margin around the region so edges are fully blurred too, then
    // overlay a coarse pixelation pass underneath so text can't be recovered.
    const radius = Math.max(4, s.strength);
    const m = Math.ceil(radius * 2);
    const sx = Math.max(0, r.x - m), sy = Math.max(0, r.y - m);
    const sw = Math.min(base.width - sx, r.w + m * 2), sh = Math.min(base.height - sy, r.h + m * 2);
    const block = Math.max(3, Math.round(radius / 2));
    const small = createCanvas(Math.max(1, sw / block), Math.max(1, sh / block));
    ctx2d(small).drawImage(base, sx, sy, sw, sh, 0, 0, small.width, small.height);
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(small, 0, 0, small.width, small.height, sx, sy, sw, sh);
    ctx.filter = "none";
  }
  ctx.restore();
}

function drawArrowHead(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, width: number) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const len = Math.max(12, width * 4);
  const spread = Math.PI / 7;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - len * Math.cos(angle - spread), to.y - len * Math.sin(angle - spread));
  ctx.lineTo(to.x - len * Math.cos(angle + spread), to.y - len * Math.sin(angle + spread));
  ctx.closePath();
  ctx.fill();
}

export function drawShape(ctx: CanvasRenderingContext2D, base: HTMLCanvasElement, s: Shape) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (s.kind) {
    case "pen":
    case "highlighter": {
      ctx.globalAlpha = s.style.opacity;
      ctx.strokeStyle = s.style.color;
      ctx.lineWidth = s.style.width;
      if (s.kind === "highlighter") ctx.lineCap = "butt";
      smoothPath(ctx, s.pts);
      ctx.stroke();
      break;
    }
    case "rect":
    case "ellipse": {
      ctx.globalAlpha = s.style.opacity;
      ctx.strokeStyle = s.style.color;
      ctx.fillStyle = s.style.color;
      ctx.lineWidth = s.style.width;
      ctx.beginPath();
      if (s.kind === "rect") {
        const r = Math.min(s.style.width * 1.5, s.w / 2, s.h / 2);
        ctx.roundRect(s.x, s.y, s.w, s.h, r);
      } else {
        ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.max(0.5, s.w / 2), Math.max(0.5, s.h / 2), 0, 0, Math.PI * 2);
      }
      if (s.fill) {
        ctx.globalAlpha = s.style.opacity * 0.28;
        ctx.fill();
        ctx.globalAlpha = s.style.opacity;
      }
      ctx.stroke();
      break;
    }
    case "line":
    case "arrow": {
      ctx.globalAlpha = s.style.opacity;
      ctx.strokeStyle = s.style.color;
      ctx.fillStyle = s.style.color;
      ctx.lineWidth = s.style.width;
      let end = s.b;
      if (s.kind === "arrow") {
        const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
        const head = Math.max(12, s.style.width * 4) * 0.8;
        if (len > head) {
          const k = (len - head) / len;
          end = { x: s.a.x + (s.b.x - s.a.x) * k, y: s.a.y + (s.b.y - s.a.y) * k };
        }
      }
      ctx.beginPath();
      ctx.moveTo(s.a.x, s.a.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      if (s.kind === "arrow") drawArrowHead(ctx, s.a, s.b, s.style.width);
      break;
    }
    case "text": {
      const lines = s.text.split("\n");
      const box = measureText(s);
      const pad = s.background ? s.fontSize * 0.35 : 0;
      ctx.globalAlpha = s.opacity;
      ctx.font = `600 ${s.fontSize}px ${s.fontFamily}`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      if (s.background) {
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.roundRect(s.x, s.y, box.w, box.h, s.fontSize * 0.25);
        ctx.fill();
      }
      ctx.fillStyle = s.background ? (luminance(s.color) > 0.6 ? "#111827" : "#ffffff") : s.color;
      lines.forEach((line, i) => {
        const rtl = hasArabic(line);
        ctx.direction = rtl ? "rtl" : "ltr";
        ctx.textAlign = "left";
        const lw = ctx.measureText(line).width;
        const inner = box.w - pad * 2;
        let x = s.x + pad;
        if (s.align === "center") x += (inner - lw) / 2;
        else if ((s.align === "start") === rtl) x += inner - lw;
        // textAlign "left" anchors at the left edge in both directions; `direction`
        // only controls bidi ordering and shaping of the line.
        ctx.fillText(line, x, s.y + pad + i * s.fontSize * 1.3 + s.fontSize * 0.08);
      });
      break;
    }
    case "marker": {
      ctx.globalAlpha = s.opacity;
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = s.size * 0.15;
      ctx.shadowOffsetY = s.size * 0.05;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = Math.max(1.5, s.size * 0.06);
      ctx.stroke();
      ctx.fillStyle = luminance(s.color) > 0.6 ? "#111827" : "#ffffff";
      ctx.font = `700 ${Math.round(s.size * (s.n > 9 ? 0.46 : 0.55))}px "Inter Variable", "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.direction = "ltr";
      ctx.fillText(String(s.n), s.x, s.y + s.size * 0.03);
      break;
    }
    case "redact":
      drawRedaction(ctx, base, s);
      break;
  }
  ctx.restore();
}

/** Renders the document into `target` (resized to the base image). */
export function renderDoc(target: HTMLCanvasElement, doc: Doc, hiddenId?: string | null) {
  if (target.width !== doc.base.width || target.height !== doc.base.height) {
    target.width = doc.base.width;
    target.height = doc.base.height;
  }
  const ctx = ctx2d(target);
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(doc.base, 0, 0);
  for (const s of doc.shapes) if (s.id !== hiddenId) drawShape(ctx, doc.base, s);
}

/** Bakes all annotations into a new base canvas. */
export function flatten(doc: Doc): HTMLCanvasElement {
  const out = createCanvas(doc.base.width, doc.base.height);
  renderDoc(out, doc);
  return out;
}

export function cropCanvas(src: HTMLCanvasElement, r: Rect): HTMLCanvasElement {
  const out = createCanvas(r.w, r.h);
  ctx2d(out).drawImage(src, r.x, r.y, r.w, r.h, 0, 0, out.width, out.height);
  return out;
}

export function rotateCanvas(src: HTMLCanvasElement, dir: 1 | -1): HTMLCanvasElement {
  const out = createCanvas(src.height, src.width);
  const ctx = ctx2d(out);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

export function resizeCanvas(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  // Step down in halves for better quality on large reductions.
  let cur = src;
  while (cur.width / 2 >= w && cur.height / 2 >= h) {
    const half = createCanvas(cur.width / 2, cur.height / 2);
    const c = ctx2d(half);
    c.imageSmoothingQuality = "high";
    c.drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  const out = createCanvas(w, h);
  const c = ctx2d(out);
  c.imageSmoothingQuality = "high";
  c.drawImage(cur, 0, 0, out.width, out.height);
  return out;
}

export async function canvasToPng(c: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("PNG encoding failed");
  return new Uint8Array(await blob.arrayBuffer());
}

export function pickColor(c: HTMLCanvasElement, x: number, y: number): string {
  const d = ctx2d(c).getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(d[0]!)}${hex(d[1]!)}${hex(d[2]!)}`;
}
