import { useId } from "react";

import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  // Unique per instance: a gradient defined inside a hidden copy would not render.
  const gradient = `yvs-logo-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C5CFC" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" className="fill-elevated" />
      <path
        d="M14 22V16a2 2 0 0 1 2-2h6M42 14h6a2 2 0 0 1 2 2v6M50 42v6a2 2 0 0 1-2 2h-6M22 50h-6a2 2 0 0 1-2-2v-6"
        stroke={`url(#${gradient})`}
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="32" cy="32" r="8" fill={`url(#${gradient})`} />
    </svg>
  );
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && (
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">YOLO Vision</p>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Studio</p>
        </div>
      )}
    </div>
  );
}
