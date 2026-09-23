import { describe, expect, it } from "vitest";
import { findMatches, highlightTerms, normalize, segment, snippet, wordMatches } from "./normalize";

describe("normalize (mirrors the Rust search normalizer)", () => {
  it("folds Arabic letter variants, diacritics and digits", () => {
    expect(normalize("أحمد")).toBe(normalize("احمد"));
    expect(normalize("مدرسة")).toBe("مدرسه");
    expect(normalize("مُحَمَّد")).toBe("محمد");
    expect(normalize("علـــي")).toBe("علي");
    expect(normalize("٢٠٢٦")).toBe("2026");
    expect(normalize("Cloudflare R2")).toBe("cloudflare r2");
  });
});

describe("highlight terms", () => {
  it("drops tags and dates and keeps phrases", () => {
    expect(highlightTerms('#bug "build failed" 2026-09 vercel')).toEqual(["build failed", "vercel"]);
  });

  it("splits on punctuation like the FTS tokenizer", () => {
    expect(highlightTerms("next.js")).toEqual(["next", "js"]);
  });
});

describe("findMatches", () => {
  it("maps matches in normalized text back to the original", () => {
    const text = "Deploying to Cloudflare R2";
    const ranges = findMatches(text, highlightTerms("cloudflare"));
    expect(ranges).toHaveLength(1);
    expect(text.slice(ranges[0]!.start, ranges[0]!.end)).toBe("Cloudflare");
  });

  it("matches Arabic across letter variants and removed diacritics", () => {
    const text = "فاتورةُ الإنترنت الشهرية";
    const ranges = findMatches(text, highlightTerms("فاتوره الانترنت"));
    expect(ranges.map((r) => text.slice(r.start, r.end))).toEqual(["فاتورةُ", "الإنترنت"]);
  });

  it("merges overlapping matches", () => {
    const ranges = findMatches("vercel", ["verc", "rcel"]);
    expect(ranges).toEqual([{ start: 0, end: 6 }]);
  });

  it("segments text into plain and highlighted parts", () => {
    const parts = segment("a Vercel b", findMatches("a Vercel b", ["vercel"]));
    expect(parts.map((p) => [p.text, p.hit])).toEqual([
      ["a ", false],
      ["Vercel", true],
      [" b", false],
    ]);
  });

  it("builds a snippet around the first match", () => {
    const long = `${"x ".repeat(200)}needle ${"y ".repeat(200)}`;
    const s = snippet(long, ["needle"], 20);
    expect(s.text.startsWith("…")).toBe(true);
    expect(s.text.slice(s.ranges[0]!.start, s.ranges[0]!.end)).toBe("needle");
  });

  it("matches OCR words for on-image highlighting", () => {
    expect(wordMatches("Cloudflare,", ["cloud"])).toBe(true);
    expect(wordMatches("الإعدادات", ["الاعدادات"])).toBe(true);
    expect(wordMatches("Vercel", ["cloud"])).toBe(false);
  });
});
