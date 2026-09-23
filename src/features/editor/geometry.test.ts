import { describe, expect, it } from "vitest";
import { clampRect, distToSegment, hasArabic, hitTest, nextMarkerNumber, normRect, pick, resizeRect, shapeBounds, translate } from "./geometry";
import type { Shape } from "./model";

const style = { color: "#f00", width: 4, opacity: 1 };

describe("editor geometry", () => {
  it("normalizes rectangles drawn in any direction", () => {
    expect(normRect({ x: 10, y: 10 }, { x: 0, y: 5 })).toEqual({ x: 0, y: 5, w: 10, h: 5 });
  });

  it("measures distance to segments", () => {
    expect(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distToSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });

  it("hit-tests lines, ellipses and markers", () => {
    const arrow: Shape = { id: "a", kind: "arrow", a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, style };
    expect(hitTest(arrow, { x: 50, y: 3 }, 2)).toBe(true);
    expect(hitTest(arrow, { x: 50, y: 30 }, 2)).toBe(false);
    const ellipse: Shape = { id: "e", kind: "ellipse", x: 0, y: 0, w: 100, h: 50, style, fill: false };
    expect(hitTest(ellipse, { x: 50, y: 25 }, 0)).toBe(true);
    expect(hitTest(ellipse, { x: 2, y: 2 }, 0)).toBe(false);
    const marker: Shape = { id: "m", kind: "marker", x: 10, y: 10, n: 1, color: "#f00", size: 20, opacity: 1 };
    expect(hitTest(marker, { x: 18, y: 10 }, 0)).toBe(true);
  });

  it("picks the topmost shape", () => {
    const a: Shape = { id: "a", kind: "rect", x: 0, y: 0, w: 50, h: 50, style, fill: true };
    const b: Shape = { id: "b", kind: "redact", x: 10, y: 10, w: 20, h: 20, mode: "blur", strength: 10 };
    expect(pick([a, b], { x: 15, y: 15 }, 0)?.id).toBe("b");
    expect(pick([a, b], { x: 45, y: 45 }, 0)?.id).toBe("a");
    expect(pick([a, b], { x: 90, y: 90 }, 0)).toBeUndefined();
  });

  it("moves and resizes shapes", () => {
    const pen: Shape = { id: "p", kind: "pen", pts: [{ x: 0, y: 0 }, { x: 10, y: 10 }], style };
    const moved = translate(pen, 5, -5) as Extract<Shape, { kind: "pen" | "highlighter" }>;
    expect(moved.pts[1]).toEqual({ x: 15, y: 5 });
    expect(shapeBounds(moved)).toEqual({ x: 3, y: -7, w: 14, h: 14 });
    expect(resizeRect({ x: 0, y: 0, w: 10, h: 10 }, "se", { x: 20, y: 30 })).toEqual({ x: 0, y: 0, w: 20, h: 30 });
    // Dragging a handle past the opposite edge flips instead of producing negative sizes.
    expect(resizeRect({ x: 10, y: 10, w: 10, h: 10 }, "w", { x: 30, y: 0 })).toEqual({ x: 20, y: 10, w: 10, h: 10 });
  });

  it("clamps crop rectangles to the image", () => {
    expect(clampRect({ x: -10, y: 5, w: 500, h: 500 }, 100, 80)).toEqual({ x: 0, y: 5, w: 100, h: 75 });
  });

  it("numbers markers sequentially", () => {
    const m = (n: number): Shape => ({ id: `m${n}`, kind: "marker", x: 0, y: 0, n, color: "#000", size: 10, opacity: 1 });
    expect(nextMarkerNumber([])).toBe(1);
    expect(nextMarkerNumber([m(1), m(4), m(2)])).toBe(5);
  });

  it("detects Arabic text for RTL rendering", () => {
    expect(hasArabic("كلمة المرور")).toBe(true);
    expect(hasArabic("password")).toBe(false);
  });
});
