import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AppWindow, Camera, ChevronDown, Crop, Monitor, MonitorSmartphone, Timer, Upload } from "lucide-react";
import { api } from "@/services/api";
import { Dropdown } from "@/components/ui/Menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { useActions } from "@/hooks/useActions";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";

/** Split button: primary action captures a region; the menu offers every mode. */
export function CaptureButton({ size = "md" }: { size?: "md" | "lg" }) {
  const { t, i18n } = useTranslation();
  const settings = useSettings();
  const actions = useActions();
  const { data: monitors = [] } = useQuery({ queryKey: ["monitors"], queryFn: api.listMonitors, staleTime: 30_000 });
  const lg = size === "lg";

  return (
    <div className={cn("no-drag inline-flex items-stretch rounded-lg shadow-[0_1px_2px_rgb(0_0_0/0.2)]", lg && "rounded-xl")}>
      <Tooltip label={t("capture.region")} shortcut={settings.hotkeys.region}>
        <button
          type="button"
          onClick={() => void actions.capture("region")}
          className={cn(
            "inline-flex items-center gap-2 bg-accent font-medium text-accent-fg transition-colors hover:bg-accent-hover",
            lg ? "h-11 rounded-s-xl ps-5 pe-4 text-sm" : "h-8 rounded-s-lg ps-3 pe-2.5 text-[0.8125rem]",
          )}
        >
          <Camera className={lg ? "size-[1.125rem]" : "size-4"} />
          {lg ? t("capture.captureScreenshot") : t("capture.button")}
        </button>
      </Tooltip>
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <button
            type="button"
            aria-label={t("capture.moreModes")}
            className={cn(
              "inline-flex items-center justify-center border-s border-white/20 bg-accent text-accent-fg transition-colors hover:bg-accent-hover data-[state=open]:bg-accent-hover",
              lg ? "w-10 rounded-e-xl" : "w-7 rounded-e-lg",
            )}
          >
            <ChevronDown className="size-4" />
          </button>
        </Dropdown.Trigger>
        <Dropdown.Content className="min-w-64">
          <Dropdown.Item icon={<Crop />} shortcut={settings.hotkeys.region} onSelect={() => void actions.capture("region")}>
            {t("capture.region")}
          </Dropdown.Item>
          <Dropdown.Item icon={<AppWindow />} shortcut={settings.hotkeys.window} onSelect={() => void actions.capture("window")}>
            {t("capture.window")}
          </Dropdown.Item>
          <Dropdown.Item icon={<Monitor />} shortcut={settings.hotkeys.fullscreen} onSelect={() => void actions.capture("fullscreen")}>
            {t("capture.fullscreen")}
          </Dropdown.Item>
          <Dropdown.Item icon={<Timer />} onSelect={() => void actions.capture("delayed")}>
            {t("capture.delayedDesc", { s: formatNumber(settings.captureDelay || 3, i18n.language) })}
          </Dropdown.Item>
          {monitors.length > 1 ? (
            <>
              <Dropdown.Separator />
              {monitors.map((m) => (
                <Dropdown.Item key={m.index} icon={<Monitor />} onSelect={() => void actions.capture("monitor", m.index)}>
                  <span className="flex items-center justify-between gap-3">
                    <span>{t("capture.monitor", { name: m.name })}</span>
                    <span className="text-xs text-fg-subtle" dir="ltr">
                      {m.rect.w}×{m.rect.h}
                    </span>
                  </span>
                </Dropdown.Item>
              ))}
              <Dropdown.Item icon={<MonitorSmartphone />} onSelect={() => void actions.capture("allMonitors")}>
                {t("capture.allMonitors")}
              </Dropdown.Item>
            </>
          ) : null}
          <Dropdown.Separator />
          <Dropdown.Item icon={<Upload />} onSelect={() => void actions.importFiles()}>
            {t("dashboard.import")}
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Root>
    </div>
  );
}
