import { Clapperboard, Download, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

import { ErrorState } from "@/components/common/ErrorState";
import { JobStatusBadge } from "@/components/common/StatusBadge";
import { ClassBreakdown } from "@/components/detection/ClassBreakdown";
import { ImageWithOverlay } from "@/components/detection/ImageWithOverlay";
import { OverlayToggles } from "@/components/detection/OverlayToggles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useHistoryEntry } from "@/hooks/queries";
import { useClassColors } from "@/hooks/useClassColors";
import { apiUrl, downloadUrl } from "@/services/api";
import { usePreferences } from "@/stores/preferences";
import type { Detection } from "@/types/api";
import { formatDateTime, formatMs, titleCase } from "@/utils/format";

export function HistoryDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const entry = useHistoryEntry(id);
  const display = usePreferences((s) => s.display);
  const item = entry.data;
  const colorFor = useClassColors(item?.model_id);
  const summary = (item?.summary ?? {}) as Record<string, unknown>;
  const detections = (summary.detections as Detection[] | undefined) ?? [];
  const width = Number(summary.width) || 0;
  const height = Number(summary.height) || 0;

  const files = item
    ? ([
        ["Annotated image", item.artifacts.annotated_url],
        ["Original image", item.artifacts.original_url],
        ["Annotated video", item.artifacts.output_url],
        ["Original video", item.artifacts.input_url],
      ] as const).filter(([, url]) => url)
    : [];

  return (
    <Dialog open={id != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{item?.source_name ?? "History entry"}</DialogTitle>
          <DialogDescription>{item ? `${titleCase(item.kind)} · ${formatDateTime(item.created_at)}` : "Loading…"}</DialogDescription>
        </DialogHeader>
        {entry.isLoading && <Skeleton className="h-64" />}
        {entry.isError && <ErrorState error={entry.error} title="Could not load this entry" />}
        {item && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <JobStatusBadge status={item.status} />
              {item.files_expired ? (
                <Badge variant="warning">Files expired</Badge>
              ) : files.length ? (
                <Badge variant="success">Files available</Badge>
              ) : (
                <Badge variant="secondary">No files retained</Badge>
              )}
              {item.expires_at && !item.files_expired && <span className="text-xs text-muted-foreground">Files kept until {formatDateTime(item.expires_at)}</span>}
            </div>

            {item.kind === "image" && item.artifacts.original_url && width > 0 && (
              <div className="space-y-2">
                <div className="flex justify-end">
                  <OverlayToggles />
                </div>
                <ImageWithOverlay src={apiUrl(item.artifacts.original_url)} alt={item.source_name} width={width} height={height} maxHeight="45vh" overlay={{ detections, display }} />
              </div>
            )}

            {item.error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{item.error}</p>}

            <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[
                ["Model", item.model_name ?? "Unavailable"],
                ["Task", item.task ? titleCase(item.task) : "Unavailable"],
                ["Detections", String(item.num_detections)],
                ["Processing time", formatMs(item.duration_ms)],
                ["Avg inference", formatMs(item.avg_inference_ms)],
                ["Completed", formatDateTime(item.completed_at)],
                ...(item.kind === "live"
                  ? [
                      ["Frames processed", String(summary.frames_processed ?? "—")],
                      ["Frames dropped", String(summary.frames_dropped ?? "—")],
                    ]
                  : []),
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-xl border bg-background/40 p-2.5">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                  <dd className="text-sm font-medium [overflow-wrap:anywhere]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            {Object.keys(item.class_counts).length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Detections by class</h4>
                <ClassBreakdown rows={Object.entries(item.class_counts).map(([name, count]) => ({ name, count }))} max={6} colorFor={colorFor} />
              </div>
            )}

            <details className="rounded-xl border bg-background/40 p-3 text-sm">
              <summary className="cursor-pointer font-medium">Inference settings</summary>
              <pre className="mt-2 overflow-x-auto font-mono text-xs text-muted-foreground">{JSON.stringify(item.params, null, 2)}</pre>
            </details>

            <div className="flex flex-wrap gap-2">
              {files.map(([label, url]) => (
                <Button key={label} asChild variant="secondary" size="sm">
                  <a href={downloadUrl(url) ?? undefined}>
                    <Download /> {label}
                  </a>
                </Button>
              ))}
              {item.kind === "video" && (
                <Button asChild size="sm">
                  <Link to={`/video?job=${item.id}`} onClick={onClose}>
                    <Clapperboard /> Open in Video Studio <ExternalLink />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
