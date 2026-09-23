// Editor document model. Coordinates are image pixels.

export interface Pt {
  x: number;
  y: number;
}

export interface Stroke {
  color: string;
  width: number;
  opacity: number;
}

export type RedactMode = "blur" | "pixelate" | "blackout";
export type TextAlign = "start" | "center" | "end";

export type Shape =
  | { id: string; kind: "pen" | "highlighter"; pts: Pt[]; style: Stroke }
  | { id: string; kind: "rect" | "ellipse"; x: number; y: number; w: number; h: number; style: Stroke; fill: boolean }
  | { id: string; kind: "line" | "arrow"; a: Pt; b: Pt; style: Stroke }
  | {
      id: string;
      kind: "text";
      x: number;
      y: number;
      text: string;
      color: string;
      opacity: number;
      fontSize: number;
      fontFamily: string;
      align: TextAlign;
      background: boolean;
    }
  | { id: string; kind: "marker"; x: number; y: number; n: number; color: string; size: number; opacity: number }
  | { id: string; kind: "redact"; x: number; y: number; w: number; h: number; mode: RedactMode; strength: number };

export type ShapeKind = Shape["kind"];

export type Tool =
  | "select"
  | "crop"
  | "pen"
  | "highlighter"
  | "rect"
  | "ellipse"
  | "arrow"
  | "line"
  | "text"
  | "marker"
  | "privacy"
  | "eraser"
  | "eyedropper";

export interface Doc {
  /** The image with geometric edits (crop/rotate/resize) applied. */
  base: HTMLCanvasElement;
  shapes: Shape[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

let counter = 0;
export function newId(): string {
  counter += 1;
  return `s${Date.now().toString(36)}${counter}`;
}

export const SWATCHES = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#ffffff", "#111827"];

export const FONTS = [
  { label: "Inter", value: '"Inter Variable", "IBM Plex Sans Arabic", sans-serif' },
  { label: "Segoe UI", value: '"Segoe UI", "IBM Plex Sans Arabic", sans-serif' },
  { label: "IBM Plex Sans Arabic", value: '"IBM Plex Sans Arabic", sans-serif' },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Consolas", value: 'Consolas, "Cascadia Mono", monospace' },
];
