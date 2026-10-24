import { cn } from "@/lib/utils";

interface Row {
  name: string;
  count: number;
  colorClassId?: number;
}

/**
 * Per-class counts as a thin bar list. Bars share one accent (a single series);
 * the class identity colour sits in the swatch beside the label so it matches
 * the overlays. Values are always printed, so nothing is hover-only.
 */
export function ClassBreakdown({
  rows,
  colorFor,
  max = 8,
  className,
  unit = "",
}: {
  rows: Row[];
  colorFor?: (row: Row) => string | undefined;
  max?: number;
  className?: string;
  unit?: string;
}) {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const shown = sorted.slice(0, max);
  const rest = sorted.slice(max);
  if (rest.length) shown.push({ name: `Other (${rest.length})`, count: rest.reduce((s, r) => s + r.count, 0) });
  const peak = Math.max(1, ...shown.map((r) => r.count));

  return (
    <ul className={cn("space-y-2.5", className)}>
      {shown.map((row) => {
        const swatch = colorFor?.(row);
        return (
          <li key={row.name} className="group" title={`${row.name}: ${row.count}${unit}`}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: swatch ?? "rgb(var(--muted-foreground))" }}
                  aria-hidden
                />
                <span className="truncate">{row.name}</span>
              </span>
              <span className="tabular font-medium">
                {row.count}
                {unit}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-elevated" aria-hidden>
              <div
                className="h-full rounded-r-[4px] bg-primary transition-[width,filter] duration-500 group-hover:brightness-125"
                style={{ width: `${(row.count / peak) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
