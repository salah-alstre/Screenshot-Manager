// Keyboard shortcut helpers. Shortcuts are stored as strings like "Ctrl+Shift+1".

const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Win"] as const;

const KEY_NAMES: Record<string, string> = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Esc",
  Delete: "Delete",
  Backspace: "Backspace",
  Enter: "Enter",
  Tab: "Tab",
  PrintScreen: "PrintScreen",
};

/** Physical key name, independent of keyboard layout (so Arabic layouts work). */
export function keyName(e: Pick<KeyboardEvent, "key" | "code">): string | null {
  const { code, key } = e;
  if (["Control", "Shift", "Alt", "Meta", "OS"].includes(key)) return null;
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad") && /\d$/.test(code)) return `Num${code.slice(6)}`;
  if (/^F\d{1,2}$/.test(code)) return code;
  if (KEY_NAMES[key]) return KEY_NAMES[key]!;
  if (code === "PrintScreen") return "PrintScreen";
  const punct: Record<string, string> = {
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backslash: "\\",
    Backquote: "`",
  };
  if (punct[code]) return punct[code]!;
  return key.length === 1 ? key.toUpperCase() : key;
}

type KeyLike = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

export function eventToShortcut(e: KeyLike): string | null {
  const key = keyName(e);
  if (!key) return null;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Win");
  return [...mods, key].join("+");
}

export function parseShortcut(s: string): { mods: Set<string>; key: string } | null {
  if (!s) return null;
  const parts = s.split("+").map((p) => p.trim()).filter(Boolean);
  const key = parts.pop();
  if (!key) return null;
  return { mods: new Set(parts), key };
}

export function hasModifier(s: string): boolean {
  const p = parseShortcut(s);
  return !!p && ["Ctrl", "Alt", "Shift", "Win"].some((m) => p.mods.has(m));
}

/** True if the keyboard event matches the stored shortcut exactly. */
export function matches(e: KeyboardEvent, shortcut: string): boolean {
  const p = parseShortcut(shortcut);
  if (!p) return false;
  const key = keyName(e);
  if (!key || key.toLowerCase() !== p.key.toLowerCase()) return false;
  return (
    e.ctrlKey === p.mods.has("Ctrl") &&
    e.altKey === p.mods.has("Alt") &&
    e.shiftKey === p.mods.has("Shift") &&
    e.metaKey === p.mods.has("Win")
  );
}

export function normalizeShortcut(s: string): string {
  const p = parseShortcut(s);
  if (!p) return "";
  const mods = MODIFIER_ORDER.filter((m) => p.mods.has(m));
  return [...mods, p.key].join("+");
}

/** Splits a shortcut into display keys, e.g. ["Ctrl", "Shift", "1"]. */
export function shortcutKeys(s: string): string[] {
  return s ? s.split("+") : [];
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}
