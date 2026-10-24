import { AlertCircle, CheckCircle2, CircleDashed, Clock, Loader2, Ban } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { JobStatus, ModelStatus } from "@/types/api";

const MODEL_STATUS = {
  loaded: { label: "Loaded", variant: "success", icon: CheckCircle2 },
  loading: { label: "Loading", variant: "warning", icon: Loader2 },
  not_loaded: { label: "Not loaded", variant: "secondary", icon: CircleDashed },
  error: { label: "Error", variant: "destructive", icon: AlertCircle },
} as const;

export function ModelStatusBadge({ status }: { status: ModelStatus }) {
  const meta = MODEL_STATUS[status];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant}>
      <Icon className={status === "loading" ? "animate-spin" : undefined} aria-hidden />
      {meta.label}
    </Badge>
  );
}

const JOB_STATUS = {
  queued: { label: "Queued", variant: "secondary", icon: Clock },
  running: { label: "Running", variant: "default", icon: Loader2 },
  completed: { label: "Completed", variant: "success", icon: CheckCircle2 },
  failed: { label: "Failed", variant: "destructive", icon: AlertCircle },
  cancelled: { label: "Cancelled", variant: "warning", icon: Ban },
} as const;

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const meta = JOB_STATUS[status];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant}>
      <Icon className={status === "running" ? "animate-spin" : undefined} aria-hidden />
      {meta.label}
    </Badge>
  );
}
