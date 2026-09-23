import { useId } from "react";
import { cn } from "@/utils/cn";

/** SnapVault app mark: capture corners framing a stacked image library. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 1024 1024" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5B86FF" />
          <stop offset="1" stopColor="#2F4FE0" />
        </linearGradient>
        <clipPath id={`clip${id}`}>
          <rect x="262" y="372" width="440" height="332" rx="46" />
        </clipPath>
      </defs>
      <rect x="32" y="32" width="960" height="960" rx="224" fill={`url(#bg${id})`} />
      <g fill="none" stroke="#fff" strokeWidth="58" strokeLinecap="round" strokeLinejoin="round">
        <path d="M168 318 V218 a50 50 0 0 1 50 -50 H318" />
        <path d="M706 168 H806 a50 50 0 0 1 50 50 V318" />
        <path d="M856 706 V806 a50 50 0 0 1 -50 50 H706" />
        <path d="M318 856 H218 a50 50 0 0 1 -50 -50 V706" />
      </g>
      <rect x="334" y="300" width="440" height="332" rx="46" fill="#fff" fillOpacity="0.42" />
      <rect x="262" y="372" width="440" height="332" rx="46" fill="#fff" />
      <g clipPath={`url(#clip${id})`}>
        <circle cx="384" cy="482" r="40" fill="#3A5CF0" />
        <path d="M232 720 L420 548 L520 640 L590 578 L740 720 Z" fill="#3A5CF0" />
      </g>
    </svg>
  );
}

/** Wordmark: "Snap" in regular weight, "Vault" in semibold. Always LTR. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span dir="ltr" className={cn("text-[0.9375rem] tracking-[-0.01em] text-fg", className)}>
      <span className="font-medium">Snap</span>
      <span className="font-bold">Vault</span>
    </span>
  );
}
