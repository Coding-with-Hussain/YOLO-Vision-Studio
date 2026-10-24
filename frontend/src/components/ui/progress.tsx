import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as React from "react";

import { cn } from "@/lib/utils";

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  /** Percentage 0-100, or null for an indeterminate bar. */
  value: number | null;
  indicatorClassName?: string;
}

export const Progress = React.forwardRef<React.ElementRef<typeof ProgressPrimitive.Root>, ProgressProps>(
  ({ className, value, indicatorClassName, ...props }, ref) => (
    <ProgressPrimitive.Root
      ref={ref}
      value={value}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-elevated", className)}
      {...props}
    >
      {value == null ? (
        <div className={cn("absolute inset-y-0 w-2/5 animate-indeterminate rounded-full bg-primary", indicatorClassName)} />
      ) : (
        <ProgressPrimitive.Indicator
          className={cn("h-full rounded-full bg-gradient-to-r from-primary to-cyan transition-[width] duration-500 ease-out", indicatorClassName)}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      )}
    </ProgressPrimitive.Root>
  ),
);
Progress.displayName = "Progress";
