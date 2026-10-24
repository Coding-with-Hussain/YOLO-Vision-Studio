import { AlertTriangle, Download, Pause, Play } from "lucide-react";
import { useRef, useState } from "react";

import { TimelineChart } from "@/components/charts/TimelineChart";
import { ClassBreakdown } from "@/components/detection/ClassBreakdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useClassColors } from "@/hooks/useClassColors";
import { apiUrl, downloadUrl } from "@/services/api";
import type { JobResponse, VideoResult } from "@/types/api";
import { formatBytes, formatDuration, formatMs, formatNumber } from "@/utils/format";

export function VideoResultView({ job, result, localUrl }: { job: JobResponse; result: VideoResult; localUrl: string | null }) {
  const original = useRef<HTMLVideoElement>(null);
  const annotated = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const colorFor = useClassColors(job.model.id);
  const originalSrc = localUrl ?? (result.input_url ? apiUrl(result.input_url) : null);
  const outputSrc = result.output_url ? apiUrl(result.output_url) : null;

  const togglePlay = async () => {
    const videos = [original.current, annotated.current].filter(Boolean) as HTMLVideoElement[];
    if (playing) {
      videos.forEach((v) => v.pause());
      setPlaying(false);
      return;
    }
    const t = annotated.current?.currentTime ?? 0;
    videos.forEach((v) => (v.currentTime = t));
    try {
      await Promise.all(videos.map((v) => v.play()));
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  const stats = [
    { label: "Total detections", value: formatNumber(result.total_detections) },
    { label: "Processing time", value: formatDuration(result.processing_time_s) },
    { label: "Avg inference", value: formatMs(result.avg_inference_ms) },
    { label: "Frames analysed", value: `${formatNumber(result.frames_analyzed)} / ${formatNumber(result.frames_written)}` },
    { label: "Output", value: `${result.output_width}×${result.output_height} @ ${result.output_fps.toFixed(0)}fps` },
    { label: "File size", value: formatBytes(result.output_size_bytes) },
  ];

  return (
    <div className="space-y-6">
      {result.files_expired && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>The annotated video has been removed by the retention policy. Statistics are still available below.</p>
        </div>
      )}

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Result</CardTitle>
            <CardDescription>
              {job.video.filename} · {job.model.name} · {job.device ?? ""}
              {result.truncated ? " · stopped at the maximum duration" : ""}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={togglePlay} disabled={!outputSrc}>
              {playing ? <Pause /> : <Play />} {playing ? "Pause both" : "Play both"}
            </Button>
            {outputSrc && (
              <Button asChild size="sm">
                <a href={downloadUrl(result.output_url) ?? undefined}>
                  <Download /> Download Annotated Video
                </a>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <figure className="space-y-2">
              <div className="overflow-hidden rounded-xl border bg-black">
                {originalSrc ? (
                  <video ref={original} src={originalSrc} controls playsInline muted className="aspect-video w-full" onPause={() => setPlaying(false)} />
                ) : (
                  <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">Original no longer retained</div>
                )}
              </div>
              <figcaption className="text-center text-xs text-muted-foreground">Original</figcaption>
            </figure>
            <figure className="space-y-2">
              <div className="overflow-hidden rounded-xl border border-primary/30 bg-black shadow-glow-sm">
                {outputSrc ? (
                  <video ref={annotated} src={outputSrc} controls playsInline muted className="aspect-video w-full" onPause={() => setPlaying(false)} />
                ) : (
                  <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">Annotated video expired</div>
                )}
              </div>
              <figcaption className="text-center text-xs text-muted-foreground">Annotated · encoded with {result.encoder}</figcaption>
            </figure>
          </div>
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.label} className="min-w-0 rounded-xl border bg-background/40 p-3">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</dt>
                <dd className="mt-0.5 text-sm font-semibold [overflow-wrap:anywhere]">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Objects per analysed frame</CardTitle>
            <CardDescription>Hover the chart to inspect a moment in the video.</CardDescription>
          </CardHeader>
          <CardContent>
            <TimelineChart points={result.timeline} />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Peak objects per class</CardTitle>
            <CardDescription>Most instances seen in a single frame</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(result.class_peaks).length === 0 ? (
              <p className="text-sm text-muted-foreground">No objects were detected in this video.</p>
            ) : (
              <ClassBreakdown rows={Object.entries(result.class_peaks).map(([name, count]) => ({ name, count }))} colorFor={colorFor} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
