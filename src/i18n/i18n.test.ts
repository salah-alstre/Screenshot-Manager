import { describe, expect, it } from "vitest";
import en from "@/locales/en.json";
import ar from "@/locales/ar.json";
import i18n, { applyDocumentLanguage, dirFor, setLanguage } from "./index";

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else for (const [ik, iv] of flatten(v, key)) out.set(ik, iv);
  }
  return out;
}

const PLURAL = /_(zero|one|two|few|many|other)$/;
const base = (k: string) => k.replace(PLURAL, "");

describe("locale files", () => {
  const enKeys = flatten(en as Tree);
  const arKeys = flatten(ar as Tree);

  it("Arabic translates every English string", () => {
    const enBase = new Set([...enKeys.keys()].map(base));
    const arBase = new Set([...arKeys.keys()].map(base));
    expect([...enBase].filter((k) => !arBase.has(k))).toEqual([]);
    expect([...arBase].filter((k) => !enBase.has(k))).toEqual([]);
  });

  it("plural keys always include an _other form", () => {
    for (const keys of [enKeys, arKeys]) {
      const plurals = new Set([...keys.keys()].filter((k) => PLURAL.test(k)).map(base));
      for (const p of plurals) expect(keys.has(`${p}_other`), `${p}_other`).toBe(true);
    }
  });

  it("interpolation placeholders match between languages", () => {
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    for (const [k, v] of enKeys) {
      if (PLURAL.test(k)) continue;
      const other = arKeys.get(k);
      if (other !== undefined) expect(vars(other), k).toEqual(vars(v));
    }
  });

  it("Arabic strings are actually Arabic (not left untranslated)", () => {
    const allowLatin = /^(app\.name|languages\.|tray\.tooltip|native\.importTitle|format\.dimensions|capture\.monitor|settings\.about\.webview|palette\.cmd\.switchLanguage)/;
    const untranslated = [...arKeys].filter(([k, v]) => !allowLatin.test(k) && /[A-Za-z]{3}/.test(v) && !/[؀-ۿ]/.test(v));
    expect(untranslated.map(([k]) => k)).toEqual([]);
  });
});

describe("language switching", () => {
  it("sets direction and lang on the document", async () => {
    await setLanguage("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
    expect(i18n.t("nav.trash")).toBe("سلة المحذوفات");
    await setLanguage("en");
    expect(document.documentElement.dir).toBe("ltr");
    expect(i18n.t("nav.trash")).toBe("Trash");
  });

  it("uses Arabic plural categories", async () => {
    await setLanguage("ar");
    expect(i18n.t("format.screenshots", { count: 1 })).toBe("لقطة واحدة");
    expect(i18n.t("format.screenshots", { count: 2 })).toBe("لقطتان");
    expect(i18n.t("format.screenshots", { count: 5 })).toBe("5 لقطات");
    expect(i18n.t("format.screenshots", { count: 25 })).toBe("25 لقطة");
    await setLanguage("en");
    expect(i18n.t("format.screenshots", { count: 1 })).toBe("1 screenshot");
  });

  it("maps languages to text direction", () => {
    expect(dirFor("ar")).toBe("rtl");
    expect(dirFor("en")).toBe("ltr");
    applyDocumentLanguage("ar");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    applyDocumentLanguage("en");
  });
});
