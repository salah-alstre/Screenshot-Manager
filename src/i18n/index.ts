import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import ar from "@/locales/ar.json";

export type Language = "en" | "ar";

export const LANGUAGES: { code: Language; dir: "ltr" | "rtl" }[] = [
  { code: "en", dir: "ltr" },
  { code: "ar", dir: "rtl" },
];

export function dirFor(lang: string): "ltr" | "rtl" {
  return lang === "ar" ? "rtl" : "ltr";
}

/** Locale used for numbers and dates. Arabic uses Latin digits for technical values. */
export function intlLocale(lang: string): string {
  return lang === "ar" ? "ar-u-nu-latn" : "en-US";
}

/** Applies `lang` and `dir` to the document so layout mirrors for RTL. */
export function applyDocumentLanguage(lang: string) {
  const el = document.documentElement;
  el.lang = lang;
  el.dir = dirFor(lang);
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on("languageChanged", applyDocumentLanguage);

export async function setLanguage(lang: Language) {
  await i18n.changeLanguage(lang);
  applyDocumentLanguage(lang);
}

export default i18n;
