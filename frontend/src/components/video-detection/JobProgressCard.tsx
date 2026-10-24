import { Ban, Gauge, Layers, Timer } from "lucide-react";

import { InlineError } from "@/components/common/ErrorState";
import { JobStatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { JobResponse } from "@/types/api";
import { formatDuration, formatNumber } from "@/utils/format";

const STAGE_LABEL: Record<JobResponse["stage"], string> = {
  queued: "Waiting for a free worker",
  loading: "Preparing",
  processing: "Running detection on frames",
  encoding: "Encoding annotated video",
  finished: "Finished",
};

export function JobProgressCard({
  job,
  onCancel,
  cancelling,
}: {
  job: JobResponse;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const { progress } = job;
  const active = job.status === "queued" || job.status === "running";
  // Never invent a percentage: indeterminate unless the server reports one.
  const percent = job.status === "completed" ? 100 : active && progress.percent != null && job.stage !== "encoding" ? progress.percent : null;
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={job.video.filename}>
            {job.video.filename}
          </p>
          <p className="text-xs text-muted-foreground">{active ? STAGE_LABEL[job.stage] : `Model: ${job.model.name}`}</p>
        </div>
        <div className="flex items-center gap-2">
          <JobStatusBadge status={job.status} />
          {active && (
            <Button variant="secondary" size="sm" onClick={onCancel} loading={cancelling}>
              {!cancelling && <Ban />} Cancel
            </Button>
          )}
        </div>
      </div>

      {active && (
        <div className="space-y-1.5">
          <Progress value={percent} aria-label="Processing progress" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="tabular">
              {percent != null ? `${percent.toFixed(1)}%` : job.stage === "encoding" ? "Finalizing…" : "Progress unknown (no frame count)"}
            </span>
            <span className="tabular">{progress.eta_s != null && progress.eta_s > 0 ? `~${formatDuration(progress.eta_s)} left` : ""}</span>
          </div>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Metric icon={Layers} label="Frames" value={`${formatNumber(progress.frames_read)}${progress.total_frames ? ` / ${formatNumber(progress.total_frames)}` : ""}`} hint={`${formatNumber(progress.frames_analyzed)} analysed`} />
        <Metric icon={Gauge} label="Speed" value={progress.processing_fps != null ? `${progress.processing_fps.toFixed(1)} fps` : "—"} hint="measured" />
        <Metric icon={Layers} label="Detections" value={formatNumber(progress.detections)} hint="so far" />
        <Metric icon={Timer} label="Elapsed" value={formatDuration(progress.elapsed_s)} hint={job.device ?? undefined} />
      </dl>

      {job.status === "failed" && job.error && <InlineError message={job.error} />}
      {job.status === "cancelled" && <p className="text-sm text-warning">The job was cancelled. Partial output was discarded.</p>}
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint }: { icon: typeof Gauge; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-background/40 p-2.5">
      <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" aria-hidden /> {label}
      </dt>
      <dd className="tabular mt-0.5 text-sm font-semibold">{value}</dd>
      {hint && <dd className="truncate text-[11px] text-muted-foreground">{hint}</dd>}
    </div>
  );
}
