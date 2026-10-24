import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  loading,
  className,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  loading?: boolean;
  className?: string;
  tone?: "primary" | "cyan" | "success" | "warning";
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    cyan: "bg-cyan/10 text-cyan",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
  }[tone];
  return (
    <div className={cn("surface flex flex-col gap-3 p-4 sm:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className={cn("flex size-8 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="size-4" aria-hidden />
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <p className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{value}</p>
      )}
      {hint && <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
