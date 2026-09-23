import { describe, expect, it } from "vitest";
import { parseDateInput, presetRange, startOfWeek, toDateInput } from "./dates";
import { activeFilterCount, EMPTY_FILTERS, filtersToQuery } from "@/features/library/filters";

describe("date ranges", () => {
  const now = new Date(2026, 8, 23, 15, 30); // Wednesday, 23 Sep 2026

  it("computes local-day presets", () => {
    const today = presetRange("today", now);
    expect(new Date(today.from)).toEqual(new Date(2026, 8, 23));
    expect(new Date(today.to)).toEqual(new Date(2026, 8, 24));
    const yesterday = presetRange("yesterday", now);
    expect(new Date(yesterday.from)).toEqual(new Date(2026, 8, 22));
    expect(yesterday.to).toBe(today.from);
  });

  it("weeks start on Monday and months on the 1st", () => {
    expect(startOfWeek(now)).toEqual(new Date(2026, 8, 21));
    expect(new Date(presetRange("month", now).from)).toEqual(new Date(2026, 8, 1));
  });

  it("round-trips date inputs", () => {
    const ms = parseDateInput("2026-02-03")!;
    expect(toDateInput(ms)).toBe("2026-02-03");
    expect(parseDateInput("03/02/2026")).toBeUndefined();
  });
});

describe("library filters", () => {
  it("counts only active filters", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, favoritesOnly: true, tagIds: [1, 2], minWidth: 1920 })).toBe(3);
  });

  it("makes the custom end date inclusive", () => {
    const from = parseDateInput("2026-09-01")!;
    const to = parseDateInput("2026-09-30")!;
    const q = filtersToQuery({ ...EMPTY_FILTERS, date: "custom", from, to });
    expect(q.dateFrom).toBe(from);
    expect(q.dateTo).toBe(to + 86_400_000);
  });

  it("maps UI filters to backend query fields", () => {
    const q = filtersToQuery({ ...EMPTY_FILTERS, ocr: "with", largeOnly: true, collectionIds: [4] });
    expect(q).toEqual({ ocr: "with", largeOnly: true, collectionIds: [4] });
  });
});
