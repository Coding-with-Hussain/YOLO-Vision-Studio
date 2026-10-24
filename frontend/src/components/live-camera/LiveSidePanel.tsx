import { Activity, ArrowDownRight, ArrowUpRight, Boxes, Gauge, Timer } from "lucide-react";

import { Sparkline } from "@/components/charts/Sparkline";
import { ClassBreakdown } from "@/components/detection/ClassBreakdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useClassColors } from "@/hooks/useClassColors";
import type { Detection } from "@/types/api";
import { classColor } from "@/utils/colors";
import { formatMs, formatNumber } from "@/utils/format";
import type { LiveEvent, LiveStats } from "./useLiveDetection";

export function LiveSidePanel({ stats, detections, events }: { stats: LiveStats; detections: Detection[]; events: LiveEvent[] }) {
  const colorFor = useClassColors(stats.model?.id);
  const current = new Map<number, { name: string; count: number }>();
  for (const d of detections) {
    const entry = current.get(d.class_id) ?? { name: d.class_name, count: 0 };
    entry.count += 1;
    current.set(d.class_id, entry);
  }
  const tiles = [
    { icon: Gauge, label: "Inference FPS", value: stats.fps ? stats.fps.toFixed(1) : "—" },
    { icon: Timer, label: "Avg latency", value: formatMs(stats.avgLatencyMs), hint: stats.serverMs != null ? `server ${formatMs(stats.serverMs)}` : "round trip" },
    { icon: Boxes, label: "Objects now", value: String(detections.length) },
    { icon: Activity, label: "Total detected", value: formatNumber(stats.totalObjects), hint: `${formatNumber(stats.framesProcessed)} frames` },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {tiles.map(({ icon: Icon, label, value, hint }) => (
          <div key={label} className="surface p-3.5">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="size-3.5" aria-hidden /> {label}
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
            {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2 sm:pb-2">
          <CardTitle className="text-sm">Round-trip latency</CardTitle>
          <p className="text-xs text-muted-foreground">Last {stats.latencies.length || 0} frames · {stats.device ?? "device —"}</p>
        </CardHeader>
        <CardContent>
          {stats.latencies.length > 1 ? <Sparkline values={stats.latencies} height={48} /> : <p className="text-xs text-muted-foreground">Start detection to measure latency.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 sm:pb-3">
          <CardTitle className="text-sm">Detected now</CardTitle>
        </CardHeader>
        <CardContent>
          {current.size === 0 ? (
            <p className="text-xs text-muted-foreground">No objects in the current frame.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {[...current.entries()].map(([id, { name, count }]) => (
                <span key={id} className="inline-flex items-center gap-1.5 rounded-lg border bg-background/50 px-2 py-1 text-xs">
                  <span className="size-2 rounded-full" style={{ backgroundColor: classColor(id) }} aria-hidden />
                  {name}
                  <span className="tabular font-semibold">{count}</span>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 sm:pb-3">
          <CardTitle className="text-sm">Per-class detections</CardTitle>
          <p className="text-xs text-muted-foreground">Summed over analysed frames this session</p>
        </CardHeader>
        <CardContent>
          {Object.keys(stats.classTotals).length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing detected yet.</p>
          ) : (
            <ClassBreakdown rows={Object.entries(stats.classTotals).map(([name, count]) => ({ name, count }))} max={6} colorFor={colorFor} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 sm:pb-3">
          <CardTitle className="text-sm">Recent events</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground">Classes entering or leaving the frame appear here.</p>
          ) : (
            <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1" aria-live="polite">
              {events.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-xs">
                  {e.kind === "appeared" ? (
                    <ArrowUpRight className="size-3.5 shrink-0 text-success" aria-label="appeared" />
                  ) : (
                    <ArrowDownRight className="size-3.5 shrink-0 text-muted-foreground" aria-label="left" />
                  )}
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: classColor(e.classId) }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {e.className} {e.kind === "appeared" ? "detected" : "left the frame"}
                  </span>
                  <time className="tabular shrink-0 text-muted-foreground">{new Date(e.at).toLocaleTimeString()}</time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
