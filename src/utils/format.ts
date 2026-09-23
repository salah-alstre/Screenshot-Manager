import type { TFunction } from "i18next";
import { intlLocale } from "@/i18n";

export function formatBytes(t: TFunction, bytes: number, lang: string): string {
  const nf = (v: number, digits: number) =>
    new Intl.NumberFormat(intlLocale(lang), { maximumFractionDigits: digits }).format(v);
  if (bytes < 1024) return t("format.bytes", { value: nf(bytes, 0) });
  if (bytes < 1024 ** 2) return t("format.kb", { value: nf(bytes / 1024, 0) });
  if (bytes < 1024 ** 3) return t("format.mb", { value: nf(bytes / 1024 ** 2, 1) });
  return t("format.gb", { value: nf(bytes / 1024 ** 3, 2) });
}

export function formatNumber(n: number, lang: string): string {
  return new Intl.NumberFormat(intlLocale(lang)).format(n);
}

export function formatDate(ms: number, lang: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(intlLocale(lang), opts ?? { dateStyle: "medium" }).format(new Date(ms));
}

export function formatTime(ms: number, lang: string): string {
  return new Intl.DateTimeFormat(intlLocale(lang), { timeStyle: "short" }).format(new Date(ms));
}

export function formatDateTime(ms: number, lang: string): string {
  return new Intl.DateTimeFormat(intlLocale(lang), { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
}

export function formatMonth(key: string, lang: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Intl.DateTimeFormat(intlLocale(lang), { month: "short", year: "numeric" }).format(new Date(y, m - 1, 1));
}

export function formatRelative(t: TFunction, ms: number, lang: string, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return t("format.justNow");
  if (min < 60) return t("format.minutesAgo", { count: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t("format.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("format.yesterday");
  if (days < 7) return t("format.daysAgo", { count: days });
  return formatDate(ms, lang);
}

export function formatDimensions(t: TFunction, w: number, h: number, lang: string): string {
  return t("format.dimensions", { w: formatNumber(w, lang), h: formatNumber(h, lang) });
}
