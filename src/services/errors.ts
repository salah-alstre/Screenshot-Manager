import type { TFunction } from "i18next";
import type { AppError } from "@/types/models";

const VALIDATION_KEYS = [
  "name_required",
  "name_exists",
  "name_too_long",
  "name_invalid",
  "tag_invalid_chars",
  "folder_already_watched",
];

export function isAppError(e: unknown): e is AppError {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as AppError).code === "string";
}

export function isCancelled(e: unknown): boolean {
  return isAppError(e) && e.code === "cancelled";
}

/** Maps a backend error to a translated, user-friendly message (never a stack trace). */
export function errorMessage(t: TFunction, e: unknown): string {
  if (isAppError(e)) {
    const detail = e.message.split(": ").pop() ?? "";
    if (e.code === "invalid" && VALIDATION_KEYS.includes(detail)) {
      return t(`errors.${detail}`);
    }
    const key = `errors.${e.code}`;
    const msg = t(key);
    return msg === key ? t("errors.unknown") : msg;
  }
  return t("errors.unknown");
}
