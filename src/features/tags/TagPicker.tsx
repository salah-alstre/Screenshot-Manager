import { useMemo, useState, type ReactNode } from "react";
import { Popover } from "radix-ui";
import { useTranslation } from "react-i18next";
import { Check, Plus } from "lucide-react";
import { useTags } from "@/hooks/useData";
import { cn } from "@/utils/cn";
import { colorHex } from "@/utils/colors";
import { normalize } from "@/utils/normalize";

/**
 * Popover listing tags with a filter field. Selecting a tag toggles it;
 * typing a new name offers to create it.
 */
export function TagPicker({
  trigger,
  activeIds,
  onToggle,
  onCreate,
  mode = "toggle",
  align = "start",
}: {
  trigger: ReactNode;
  activeIds: number[];
  onToggle: (tagId: number, name: string, active: boolean) => void;
  onCreate?: (name: string) => void;
  mode?: "toggle" | "remove";
  align?: "start" | "end" | "center";
}) {
  const { t } = useTranslation();
  const { tags } = useTags();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const q = normalize(query.trim().replace(/^#/, ""));
  const visible = useMemo(() => {
    const list = mode === "remove" ? tags.filter((x) => activeIds.includes(x.id)) : tags;
    return q ? list.filter((x) => normalize(x.name).includes(q)) : list;
  }, [tags, q, mode, activeIds]);
  const exact = tags.some((x) => normalize(x.name) === q);
  const canCreate = !!onCreate && !!q && !exact && !/[\s,#]/.test(query.trim().replace(/^#/, ""));

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align={align} sideOffset={6} collisionPadding={8} className="glass z-[85] w-64 animate-scale-in rounded-xl border border-border p-1.5 shadow-pop">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (canCreate) {
                  onCreate!(query.trim().replace(/^#/, ""));
                  setOpen(false);
                } else if (visible[0]) {
                  onToggle(visible[0].id, visible[0].name, activeIds.includes(visible[0].id));
                }
              }
            }}
            placeholder={t("viewer.addTag")}
            aria-label={t("viewer.addTag")}
            className="mb-1 h-8 w-full rounded-lg bg-surface-2 px-2.5 text-[0.8125rem] text-fg placeholder:text-fg-subtle"
          />
          <div className="max-h-60 overflow-y-auto">
            {visible.map((tag) => {
              const active = activeIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => onToggle(tag.id, tag.name, active)}
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-start text-[0.8125rem] text-fg hover:bg-accent-soft"
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorHex(tag.color) }} />
                  <span className="flex-1 truncate text-start">
                    <span dir="auto">#{tag.name}</span>
                  </span>
                  <Check className={cn("size-4 text-accent", active && mode === "toggle" ? "opacity-100" : "opacity-0")} />
                </button>
              );
            })}
            {!visible.length && !canCreate ? <p className="px-2 py-3 text-center text-xs text-fg-subtle">{t("menu.noTags")}</p> : null}
          </div>
          {canCreate ? (
            <button
              type="button"
              onClick={() => {
                onCreate!(query.trim().replace(/^#/, ""));
                setOpen(false);
              }}
              className="mt-1 flex h-8 w-full items-center gap-2 rounded-md border-t border-border px-2 text-[0.8125rem] font-medium text-accent hover:bg-accent-soft"
            >
              <Plus className="size-4" />
              {t("viewer.createTag", { name: query.trim().replace(/^#/, "") })}
            </button>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
