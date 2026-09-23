import type { ListQuery } from "@/types/models";
import { presetRange, type DatePreset } from "@/utils/dates";

export interface Filters {
  date: "any" | DatePreset | "custom";
  from?: number;
  to?: number;
  favoritesOnly: boolean;
  ocr: "any" | "with" | "without";
  largeOnly: boolean;
  collectionIds: number[];
  tagIds: number[];
  minWidth?: number;
  minHeight?: number;
}

export const EMPTY_FILTERS: Filters = {
  date: "any",
  favoritesOnly: false,
  ocr: "any",
  largeOnly: false,
  collectionIds: [],
  tagIds: [],
};

export function activeFilterCount(f: Filters): number {
  let n = 0;
  if (f.date !== "any") n++;
  if (f.favoritesOnly) n++;
  if (f.ocr !== "any") n++;
  if (f.largeOnly) n++;
  if (f.collectionIds.length) n++;
  if (f.tagIds.length) n++;
  if (f.minWidth || f.minHeight) n++;
  return n;
}

/** Converts UI filters into backend query fields (dates resolved in local time). */
export function filtersToQuery(f: Filters, now = new Date()): Partial<ListQuery> {
  const q: Partial<ListQuery> = {};
  if (f.date === "custom") {
    if (f.from !== undefined) q.dateFrom = f.from;
    if (f.to !== undefined) q.dateTo = f.to + 86_400_000; // inclusive end day
  } else if (f.date !== "any") {
    const r = presetRange(f.date, now);
    q.dateFrom = r.from;
    q.dateTo = r.to;
  }
  if (f.favoritesOnly) q.favoritesOnly = true;
  if (f.ocr !== "any") q.ocr = f.ocr;
  if (f.largeOnly) q.largeOnly = true;
  if (f.collectionIds.length) q.collectionIds = f.collectionIds;
  if (f.tagIds.length) q.tagIds = f.tagIds;
  if (f.minWidth) q.minWidth = f.minWidth;
  if (f.minHeight) q.minHeight = f.minHeight;
  return q;
}
