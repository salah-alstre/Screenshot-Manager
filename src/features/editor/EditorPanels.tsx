import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowUpRight,
  Circle,
  Crop,
  Eraser,
  Hash,
  Highlighter,
  MousePointer2,
  Pipette,
  Minus,
  Pen,
  Square,
  Trash2,
  Type,
  ShieldCheck,
} from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { Button } from "@/components/ui/Button";
import { Segmented, Select, Slider, Switch } from "@/components/ui/controls";
import { cn } from "@/utils/cn";
import { FONTS, SWATCHES, type RedactMode, type TextAlign, type Tool } from "./model";

export const TOOL_KEYS: Record<Tool, string> = {
  select: "V",
  crop: "C",
  pen: "P",
  highlighter: "H",
  rect: "R",
  ellipse: "O",
  arrow: "A",
  line: "L",
  text: "T",
  marker: "N",
  privacy: "B",
  eraser: "X",
  eyedropper: "I",
};

const TOOL_ICONS: Record<Tool, ReactNode> = {
  select: <MousePointer2 />,
  crop: <Crop />,
  pen: <Pen />,
  highlighter: <Highlighter />,
  rect: <Square />,
  ellipse: <Circle />,
  arrow: <ArrowUpRight />,
  line: <Minus className="-rotate-45" />,
  text: <Type />,
  marker: <Hash />,
  privacy: <ShieldCheck />,
  eraser: <Eraser />,
  eyedropper: <Pipette />,
};

const GROUPS: Tool[][] = [
  ["select", "crop"],
  ["pen", "highlighter", "eraser"],
  ["rect", "ellipse", "arrow", "line"],
  ["text", "marker"],
  ["privacy"],
  ["eyedropper"],
];

export function ToolRail({ tool, onTool }: { tool: Tool; onTool: (t: Tool) => void }) {
  const { t } = useTranslation();
  return (
    <div role="toolbar" aria-orientation="vertical" className="flex w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto border-e border-border bg-surface py-3">
      {GROUPS.map((group, gi) => (
        <div key={gi} className="flex flex-col items-center gap-1">
          {gi > 0 ? <div className="my-1 h-px w-6 bg-border" /> : null}
          {group.map((id) => (
            <Tooltip key={id} label={t(`editor.tools.${id}`)} shortcut={TOOL_KEYS[id]} side="right">
              <button
                type="button"
                aria-label={t(`editor.tools.${id}`)}
                aria-pressed={tool === id}
                onClick={() => onTool(id)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg transition-colors [&>svg]:size-[1.125rem]",
                  tool === id ? "bg-accent text-accent-fg shadow-soft" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                  id === "privacy" && tool !== id && "text-success",
                )}
              >
                {TOOL_ICONS[id]}
              </button>
            </Tooltip>
          ))}
        </div>
      ))}
    </div>
  );
}

export interface ToolProps {
  color: string;
  width: number;
  opacity: number;
  fill: boolean;
  fontSize: number;
  fontFamily: string;
  align: TextAlign;
  background: boolean;
  markerSize: number;
  redactMode: RedactMode;
  strength: number;
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[0.6875rem] font-semibold tracking-wide text-fg-subtle uppercase">{label}</span>
      {children}
    </div>
  );
}

export function PropertiesPanel({
  kind,
  props,
  onChange,
  nextNumber,
  hasSelection,
  onDeleteSelected,
  hint,
}: {
  kind: Tool | "text" | "marker" | "redact" | "rect" | "ellipse" | "line" | "arrow" | "pen" | "highlighter" | null;
  props: ToolProps;
  onChange: (patch: Partial<ToolProps>) => void;
  nextNumber: number;
  hasSelection: boolean;
  onDeleteSelected: () => void;
  hint?: string;
}) {
  const { t } = useTranslation();
  const strokeKinds = ["pen", "highlighter", "rect", "ellipse", "line", "arrow"];
  const showColor = kind && [...strokeKinds, "text", "marker"].includes(kind);
  const showWidth = kind && strokeKinds.includes(kind);
  const showOpacity = kind && [...strokeKinds, "text", "marker"].includes(kind);

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-5 overflow-y-auto border-s border-border bg-surface p-4">
      {kind === "privacy" || kind === "redact" ? (
        <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-xs leading-relaxed text-fg-muted">
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-success">
            <ShieldCheck className="size-3.5" />
            {t("editor.tools.privacy")}
          </p>
          {t("editor.privacyHint")}
        </div>
      ) : null}
      {hint ? <p className="text-xs leading-relaxed text-fg-muted">{hint}</p> : null}

      {showColor ? (
        <Section label={t("editor.props.color")}>
          <div className="flex flex-wrap gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => onChange({ color: c })}
                className={cn(
                  "size-6 rounded-full border border-black/10 transition-transform hover:scale-110",
                  props.color.toLowerCase() === c && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
                )}
                style={{ background: c }}
              />
            ))}
            <label className="relative size-6 cursor-pointer overflow-hidden rounded-full border border-border bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" title={t("editor.props.customColor")}>
              <input type="color" value={props.color} onChange={(e) => onChange({ color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label={t("editor.props.customColor")} />
            </label>
          </div>
        </Section>
      ) : null}

      {showWidth ? (
        <Section label={`${t("editor.props.stroke")} · ${props.width}px`}>
          <Slider value={props.width} min={1} max={kind === "highlighter" ? 60 : 24} onChange={(v) => onChange({ width: v })} label={t("editor.props.stroke")} />
        </Section>
      ) : null}

      {showOpacity ? (
        <Section label={`${t("editor.props.opacity")} · ${Math.round(props.opacity * 100)}%`}>
          <Slider value={Math.round(props.opacity * 100)} min={10} max={100} onChange={(v) => onChange({ opacity: v / 100 })} label={t("editor.props.opacity")} />
        </Section>
      ) : null}

      {kind === "rect" || kind === "ellipse" ? (
        <label className="flex items-center justify-between text-[0.8125rem] text-fg">
          {t("editor.props.fill")}
          <Switch checked={props.fill} onChange={(v) => onChange({ fill: v })} label={t("editor.props.fill")} />
        </label>
      ) : null}

      {kind === "text" ? (
        <>
          <Section label={`${t("editor.props.fontSize")} · ${props.fontSize}px`}>
            <Slider value={props.fontSize} min={10} max={120} onChange={(v) => onChange({ fontSize: v })} label={t("editor.props.fontSize")} />
          </Section>
          <Section label={t("editor.props.fontFamily")}>
            <Select
              value={props.fontFamily}
              onChange={(v) => onChange({ fontFamily: v })}
              label={t("editor.props.fontFamily")}
              options={FONTS.map((f) => ({ value: f.value, label: f.label }))}
              className="w-full"
            />
          </Section>
          <Section label={t("editor.props.align")}>
            <Segmented
              value={props.align}
              onChange={(v) => onChange({ align: v })}
              options={[
                { value: "start", label: null, icon: <AlignLeft className="flip-rtl" />, title: t("editor.props.alignStart") },
                { value: "center", label: null, icon: <AlignCenter />, title: t("editor.props.alignCenter") },
                { value: "end", label: null, icon: <AlignRight className="flip-rtl" />, title: t("editor.props.alignEnd") },
              ]}
            />
          </Section>
          <label className="flex items-center justify-between text-[0.8125rem] text-fg">
            {t("editor.props.fill")}
            <Switch checked={props.background} onChange={(v) => onChange({ background: v })} label={t("editor.props.fill")} />
          </label>
        </>
      ) : null}

      {kind === "marker" ? (
        <>
          <Section label={`${t("editor.props.size")} · ${props.markerSize}px`}>
            <Slider value={props.markerSize} min={16} max={96} onChange={(v) => onChange({ markerSize: v })} label={t("editor.props.size")} />
          </Section>
          <p className="text-xs text-fg-muted">
            {t("editor.props.nextNumber")}: <span className="font-semibold text-fg">{nextNumber}</span>
          </p>
        </>
      ) : null}

      {kind === "privacy" || kind === "redact" ? (
        <>
          <Section label={t("editor.props.mode")}>
            <Segmented
              value={props.redactMode}
              onChange={(v) => onChange({ redactMode: v })}
              options={[
                { value: "blur", label: t("editor.tools.blur") },
                { value: "pixelate", label: t("editor.tools.pixelate") },
                { value: "blackout", label: t("editor.tools.blackout") },
              ]}
              size="sm"
            />
          </Section>
          {props.redactMode !== "blackout" ? (
            <Section label={t("editor.props.strength")}>
              <Slider value={props.strength} min={6} max={40} onChange={(v) => onChange({ strength: v })} label={t("editor.props.strength")} />
            </Section>
          ) : null}
        </>
      ) : null}

      {!kind ? <p className="text-xs leading-relaxed text-fg-subtle">{t("editor.props.noSelection")}</p> : null}

      {hasSelection ? (
        <Button variant="ghost" className="justify-start text-danger hover:bg-danger-soft hover:text-danger" icon={<Trash2 className="size-4" />} onClick={onDeleteSelected}>
          {t("editor.props.deleteSelected")}
        </Button>
      ) : null}
    </aside>
  );
}
