// Mirrors `normalize` in src-tauri/src/db/search.rs so highlighting matches
// exactly what the full-text index matched: lowercase, Arabic letter variants
// folded, tashkeel/tatweel removed, Arabic-Indic digits converted.

const ALEF_VARIANTS = new Set(["أ", "إ", "آ", "ٱ"]);

function isRemovable(code: number): boolean {
  return (
    code === 0x0640 || // tatweel
    (code >= 0x064b && code <= 0x065f) ||
    code === 0x0670 ||
    (code >= 0x06d6 && code <= 0x06ed)
  );
}

function foldChar(ch: string): string {
  const code = ch.codePointAt(0) ?? 0;
  if (isRemovable(code)) return "";
  if (ALEF_VARIANTS.has(ch)) return "ا";
  if (ch === "ى" || ch === "ئ") return "ي";
  if (ch === "ؤ") return "و";
  if (ch === "ة") return "ه";
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
  return ch.toLowerCase();
}

export function normalize(text: string): string {
  let out = "";
  for (const ch of text) out += foldChar(ch);
  return out;
}

/**
 * Normalizes text while recording, for every output code unit, the index of
 * the source character it came from — so matches can be mapped back.
 */
export function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    const folded = foldChar(ch);
    for (let k = 0; k < folded.length; k++) map.push(i);
    norm += folded;
    i += ch.length;
  }
  map.push(i);
  return { norm, map };
}

/** Terms from a search query (quotes, #tags and date tokens are ignored for highlighting). */
export function highlightTerms(query: string): string[] {
  const terms: string[] = [];
  const phraseRe = /"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = phraseRe.exec(query))) {
    const p = normalize(m[1]!.trim());
    if (p) terms.push(p);
  }
  const rest = query.replace(phraseRe, " ");
  for (const tok of rest.split(/\s+/)) {
    if (!tok || tok.startsWith("#") || /^\d{4}[-/]\d{1,2}([-/]\d{1,2})?$/.test(tok)) continue;
    for (const part of normalize(tok).split(/[^\p{L}\p{N}]+/u)) {
      if (part) terms.push(part);
    }
  }
  return [...new Set(terms)].sort((a, b) => b.length - a.length);
}

export interface Range {
  start: number;
  end: number;
}

/** Finds all occurrences of the terms in `text` (normalization-aware), as source ranges. */
export function findMatches(text: string, terms: string[]): Range[] {
  if (!terms.length || !text) return [];
  const { norm, map } = normalizeWithMap(text);
  const ranges: Range[] = [];
  for (const term of terms) {
    let from = 0;
    while (term && from <= norm.length) {
      const idx = norm.indexOf(term, from);
      if (idx < 0) break;
      ranges.push({ start: map[idx]!, end: map[idx + term.length]! });
      from = idx + Math.max(1, term.length);
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Range[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

/** Splits text into plain and highlighted segments. */
export function segment(text: string, ranges: Range[]): { text: string; hit: boolean; index: number }[] {
  const out: { text: string; hit: boolean; index: number }[] = [];
  let pos = 0;
  ranges.forEach((r, i) => {
    if (r.start > pos) out.push({ text: text.slice(pos, r.start), hit: false, index: -1 });
    out.push({ text: text.slice(r.start, r.end), hit: true, index: i });
    pos = r.end;
  });
  if (pos < text.length) out.push({ text: text.slice(pos), hit: false, index: -1 });
  return out;
}

/** A short excerpt around the first match, for result lists. */
export function snippet(text: string, terms: string[], radius = 90): { text: string; ranges: Range[] } {
  const flat = text.replace(/\s+/g, " ").trim();
  const ranges = findMatches(flat, terms);
  if (!ranges.length) return { text: flat.slice(0, radius * 2), ranges: [] };
  const first = ranges[0]!;
  const start = Math.max(0, first.start - radius);
  const end = Math.min(flat.length, first.end + radius);
  const prefix = start > 0 ? "… " : "";
  const suffix = end < flat.length ? " …" : "";
  const body = flat.slice(start, end);
  const shifted = ranges
    .filter((r) => r.start >= start && r.end <= end)
    .map((r) => ({ start: r.start - start + prefix.length, end: r.end - start + prefix.length }));
  return { text: prefix + body + suffix, ranges: shifted };
}

/** True if the OCR word (already a single token) contains any term. */
export function wordMatches(word: string, terms: string[]): boolean {
  const n = normalize(word);
  return terms.some((t) => n.includes(t) || (t.includes(" ") && t.split(" ").some((p) => p && n.includes(p))));
}
