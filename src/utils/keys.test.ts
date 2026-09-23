import { describe, expect, it } from "vitest";
import { eventToShortcut, hasModifier, keyName, matches, normalizeShortcut } from "./keys";

const ev = (init: Partial<KeyboardEvent>) =>
  ({ key: "", code: "", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...init }) as KeyboardEvent;

describe("keyboard shortcuts", () => {
  it("uses physical keys so non-Latin layouts work", () => {
    // Arabic layout: the "F" key produces "ب" but its code is still KeyF.
    expect(keyName(ev({ key: "ب", code: "KeyF" }))).toBe("F");
    expect(matches(ev({ key: "ب", code: "KeyF" }), "F")).toBe(true);
  });

  it("records combinations in canonical order", () => {
    expect(eventToShortcut(ev({ key: "!", code: "Digit1", ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+1");
    expect(eventToShortcut(ev({ key: "Control", code: "ControlLeft", ctrlKey: true }))).toBeNull();
    expect(normalizeShortcut("Shift+Ctrl+K")).toBe("Ctrl+Shift+K");
  });

  it("requires exact modifiers", () => {
    expect(matches(ev({ key: "k", code: "KeyK", ctrlKey: true }), "Ctrl+K")).toBe(true);
    expect(matches(ev({ key: "k", code: "KeyK", ctrlKey: true, shiftKey: true }), "Ctrl+K")).toBe(false);
    expect(matches(ev({ key: "Delete", code: "Delete" }), "Delete")).toBe(true);
    expect(matches(ev({ key: "Enter", code: "Enter" }), "")).toBe(false);
  });

  it("detects modifiers for global shortcuts", () => {
    expect(hasModifier("Ctrl+Shift+1")).toBe(true);
    expect(hasModifier("F")).toBe(false);
  });
});
