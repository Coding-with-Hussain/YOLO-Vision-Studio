import type { ReactNode } from "react";

/** Tooltip body: the value leads, the label follows, keyed by a short line. */
export function ChartTooltipBody({ title, value, label }: { title: ReactNode; value: ReactNode; label: string }) {
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 text-muted-foreground">{title}</p>
      <p className="flex items-center gap-2">
        <span className="h-0.5 w-3 rounded-full bg-primary" aria-hidden />
        <span className="tabular text-sm font-semibold text-foreground">{value}</span>
        <span className="text-muted-foreground">{label}</span>
      </p>
    </div>
  );
}

export const AXIS_TICK = { fill: "rgb(var(--muted-foreground))", fontSize: 11 };
export const GRID_STROKE = "rgb(var(--border))";
export const SERIES = "rgb(var(--primary))";
