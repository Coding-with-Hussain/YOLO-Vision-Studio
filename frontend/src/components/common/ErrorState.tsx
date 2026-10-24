import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeError } from "@/services/api";

export function ErrorState({
  error,
  title = "Something went wrong",
  onRetry,
  className,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center",
        className,
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
        <AlertTriangle className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{describeError(error)}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCw /> Retry
        </Button>
      )}
    </div>
  );
}

export function InlineError({ message, className }: { message: string; className?: string }) {
  return (
    <p role="alert" className={cn("flex items-start gap-2 text-sm text-destructive", className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="[overflow-wrap:anywhere]">{message}</span>
    </p>
  );
}
