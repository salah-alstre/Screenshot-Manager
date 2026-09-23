import { useState } from "react";
import { ImageOff } from "lucide-react";
import { thumbUrl } from "@/services/urls";
import { cn } from "@/utils/cn";

/** Lazy-loaded cached thumbnail with a skeleton while loading and a fallback on error. */
export function Thumb({
  id,
  version,
  alt,
  className,
  fit = "cover",
}: {
  id: number;
  version: number;
  alt: string;
  className?: string;
  fit?: "cover" | "contain";
}) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  return (
    <div className={cn("relative overflow-hidden bg-surface-2", className)}>
      {state === "loading" ? <div className="skeleton absolute inset-0" /> : null}
      {state === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center text-fg-subtle">
          <ImageOff className="size-5" />
        </div>
      ) : null}
      <img
        key={`${id}-${version}`}
        src={thumbUrl(id, version)}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setState("ok")}
        onError={() => setState("error")}
        className={cn(
          "absolute inset-0 size-full transition-opacity duration-300",
          fit === "cover" ? "object-cover object-top" : "object-contain",
          state === "ok" ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
