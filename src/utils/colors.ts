import type { NamedColor } from "@/types/models";

export const NAMED_COLORS: NamedColor[] = ["blue", "violet", "pink", "red", "orange", "amber", "green", "teal", "cyan", "slate"];

export const COLOR_HEX: Record<NamedColor, string> = {
  blue: "#4f7cff",
  violet: "#8b5cf6",
  pink: "#ec4899",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  green: "#22c55e",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  slate: "#64748b",
};

export function colorHex(c: string): string {
  return COLOR_HEX[c as NamedColor] ?? COLOR_HEX.blue;
}

/** Soft translucent background for chips. */
export function softBg(c: string, alpha = 16): string {
  return `color-mix(in srgb, ${colorHex(c)} ${alpha}%, transparent)`;
}
