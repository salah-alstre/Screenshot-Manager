import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useTranslation } from "react-i18next";
import { ImagePlus } from "lucide-react";

/** Full-window hint while files are dragged over SnapVault. Import itself happens in Rust. */
export function DropOverlay() {
  const { t } = useTranslation();
  const [active, setActive] = useState(false);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((e) => {
        const type = e.payload.type;
        if (type === "enter" || type === "over") setActive(true);
        else setActive(false);
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);
  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[150] flex animate-fade-in items-center justify-center bg-[var(--overlay)] p-6">
      <div className="flex size-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-accent bg-accent-soft backdrop-blur-sm">
        <div className="flex size-16 animate-scale-in items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-pop">
          <ImagePlus className="size-7" />
        </div>
        <p className="text-lg font-semibold text-fg">{t("drop.title")}</p>
        <p className="text-[0.8125rem] text-fg-muted">{t("drop.desc")}</p>
      </div>
    </div>
  );
}
