// Local-time date ranges for filters (computed on the frontend, which knows the user's timezone).

export type DatePreset = "today" | "yesterday" | "week" | "month";

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday-based week start (ISO), in local time. */
export function startOfWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7;
  const s = startOfDay(d);
  s.setDate(s.getDate() - day);
  return s;
}

export function presetRange(preset: DatePreset, now = new Date()): { from: number; to: number } {
  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  switch (preset) {
    case "today":
      return { from: today.getTime(), to: tomorrow.getTime() };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(today.getDate() - 1);
      return { from: y.getTime(), to: today.getTime() };
    }
    case "week":
      return { from: startOfWeek(now).getTime(), to: tomorrow.getTime() };
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: tomorrow.getTime() };
  }
}

/** Parses a yyyy-mm-dd input value as local midnight. */
export function parseDateInput(v: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

export function toDateInput(ms: number | undefined): string {
  if (ms === undefined) return "";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
