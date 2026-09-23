// Pure geometry helpers for hit testing and transforms (unit tested).
import type { Pt, Rect, Shape } from "./model";

export function normRect(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function inRect(p: Pt, r: Rect, pad = 0): boolean {
  return p.x >= r.x - pad && p.y >= r.y - pad && p.x <= r.x + r.w + pad && p.y <= r.y + r.h + pad;
}

/** Measured text box size, set by the renderer (needs a canvas context). */
export type TextMeasure = (s: Extract<Shape, { kind: "text" }>) => { w: number; h: number };

export function shapeBounds(s: Shape, measure?: TextMeasure): Rect {
  switch (s.kind) {
    case "pen":
    case "highlighter": {
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const p of s.pts) {
        x1 = Math.min(x1, p.x);
        y1 = Math.min(y1, p.y);
        x2 = Math.max(x2, p.x);
        y2 = Math.max(y2, p.y);
      }
      const pad = s.style.width / 2;
      return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 };
    }
    case "rect":
    case "ellipse":
    case "redact":
      return { x: s.x, y: s.y, w: s.w, h: s.h };
    case "line":
    case "arrow":
      return normRect(s.a, s.b);
    case "text": {
      const m = measure ? measure(s) : { w: s.text.length * s.fontSize * 0.55, h: s.fontSize * 1.3 };
      return { x: s.x, y: s.y, w: m.w, h: m.h };
    }
    case "marker":
      return { x: s.x - s.size / 2, y: s.y - s.size / 2, w: s.size, h: s.size };
  }
}

/** Returns true if the point hits the shape (tolerance in image pixels). */
export function hitTest(s: Shape, p: Pt, tol: number, measure?: TextMeasure): boolean {
  switch (s.kind) {
    case "pen":
    case "highlighter": {
      const t = Math.max(tol, s.style.width / 2 + 2);
      if (s.pts.length === 1) return Math.hypot(p.x - s.pts[0]!.x, p.y - s.pts[0]!.y) <= t;
      for (let i = 1; i < s.pts.length; i++) if (distToSegment(p, s.pts[i - 1]!, s.pts[i]!) <= t) return true;
      return false;
    }
    case "line":
    case "arrow":
      return distToSegment(p, s.a, s.b) <= Math.max(tol, s.style.width / 2 + 3);
    case "ellipse": {
      const rx = s.w / 2, ry = s.h / 2;
      if (rx <= 0 || ry <= 0) return false;
      const nx = (p.x - (s.x + rx)) / (rx + tol), ny = (p.y - (s.y + ry)) / (ry + tol);
      return nx * nx + ny * ny <= 1;
    }
    case "marker":
      return Math.hypot(p.x - s.x, p.y - s.y) <= s.size / 2 + tol;
    default:
      return inRect(p, shapeBounds(s, measure), tol);
  }
}

/** Topmost shape under the point. */
export function pick(shapes: Shape[], p: Pt, tol: number, measure?: TextMeasure): Shape | undefined {
  for (let i = shapes.length - 1; i >= 0; i--) if (hitTest(shapes[i]!, p, tol, measure)) return shapes[i];
  return undefined;
}

export function translate(s: Shape, dx: number, dy: number): Shape {
  switch (s.kind) {
    case "pen":
    case "highlighter":
      return { ...s, pts: s.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case "line":
    case "arrow":
      return { ...s, a: { x: s.a.x + dx, y: s.a.y + dy }, b: { x: s.b.x + dx, y: s.b.y + dy } };
    default:
      return { ...s, x: s.x + dx, y: s.y + dy };
  }
}

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "a" | "b";

export function handlesFor(s: Shape, measure?: TextMeasure): { id: Handle; x: number; y: number }[] {
  if (s.kind === "line" || s.kind === "arrow") return [{ id: "a", ...s.a }, { id: "b", ...s.b }];
  if (s.kind === "rect" || s.kind === "ellipse" || s.kind === "redact") {
    const r = shapeBounds(s, measure);
    return rectHandles(r);
  }
  return [];
}

export function rectHandles(r: Rect): { id: Handle; x: number; y: number }[] {
  const { x, y, w, h } = r;
  return [
    { id: "nw", x, y },
    { id: "n", x: x + w / 2, y },
    { id: "ne", x: x + w, y },
    { id: "e", x: x + w, y: y + h / 2 },
    { id: "se", x: x + w, y: y + h },
    { id: "s", x: x + w / 2, y: y + h },
    { id: "sw", x, y: y + h },
    { id: "w", x, y: y + h / 2 },
  ];
}

/** Applies a handle drag to a rectangle (keeps it normalized). */
export function resizeRect(r: Rect, handle: Handle, p: Pt): Rect {
  let x1 = r.x, y1 = r.y, x2 = r.x + r.w, y2 = r.y + r.h;
  if (handle.includes("w")) x1 = p.x;
  if (handle.includes("e")) x2 = p.x;
  if (handle.includes("n")) y1 = p.y;
  if (handle.includes("s")) y2 = p.y;
  return normRect({ x: x1, y: y1 }, { x: x2, y: y2 });
}

export function clampRect(r: Rect, w: number, h: number): Rect {
  const x = Math.max(0, Math.min(r.x, w));
  const y = Math.max(0, Math.min(r.y, h));
  return { x, y, w: Math.max(0, Math.min(r.w, w - x)), h: Math.max(0, Math.min(r.h, h - y)) };
}

export function nextMarkerNumber(shapes: Shape[]): number {
  let max = 0;
  for (const s of shapes) if (s.kind === "marker") max = Math.max(max, s.n);
  return max + 1;
}

export function hasArabic(text: string): boolean {
  return /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(text);
}
