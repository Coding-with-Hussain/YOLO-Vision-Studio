import { cn } from "@/lib/utils";
import type { ConnectionState } from "@/hooks/queries";

const LABELS: Record<ConnectionState, string> = {
  connected: "Backend ready",
  connecting: "Connecting…",
  degraded: "Backend degraded",
  disconnected: "Backend offline",
};

export function ConnectionDot({ state, className }: { state: ConnectionState; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        state === "connected" && "animate-pulse-ring bg-success",
        state === "connecting" && "animate-pulse bg-muted-foreground",
        state === "degraded" && "bg-warning",
        state === "disconnected" && "bg-destructive",
        className,
      )}
    />
  );
}

export function connectionLabel(state: ConnectionState) {
  return LABELS[state];
}

export function ConnectionBadge({ state, className }: { state: ConnectionState; className?: string }) {
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium",
        state === "connected" && "border-success/30 bg-success/10 text-success",
        state === "connecting" && "text-muted-foreground",
        state === "degraded" && "border-warning/30 bg-warning/10 text-warning",
        state === "disconnected" && "border-destructive/30 bg-destructive/10 text-destructive",
        className,
      )}
    >
      <ConnectionDot state={state} />
      {LABELS[state]}
    </span>
  );
}
