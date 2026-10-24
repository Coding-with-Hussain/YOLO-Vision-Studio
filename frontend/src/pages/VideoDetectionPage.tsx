import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Film, Play, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { ErrorState } from "@/components/common/ErrorState";
import { ModelRequired } from "@/components/common/ModelRequired";
import { PageHeader } from "@/components/common/PageHeader";
import { JobStatusBadge } from "@/components/common/StatusBadge";
import { InferenceSettingsPanel } from "@/components/detection/InferenceSettingsPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { JobProgressCard } from "@/components/video-detection/JobProgressCard";
import { DEFAULT_VIDEO_OPTIONS, VideoSettings, type VideoOptions } from "@/components/video-detection/VideoSettings";
import { VideoInput } from "@/components/video-detection/VideoInput";
import { VideoResultView } from "@/components/video-detection/VideoResultView";
import { isJobFinished, queryKeys, useActiveModel, useHealth, useHistory, useInvalidateActivity, useJob, useRuntimeSettings } from "@/hooks/queries";
import { useInferenceParams } from "@/hooks/useInferenceParams";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { api, apiUrl, describeError } from "@/services/api";
import type { UploadHandle } from "@/services/upload";
import { useWorkspace } from "@/stores/workspace";
import type { JobResponse } from "@/types/api";
import { formatBytes, formatRelative } from "@/utils/format";

export default function VideoDetectionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { videoFile, setVideo, videoJobId, setVideoJobId } = useWorkspace();
  const [params, setParams] = useInferenceParams();
  const [options, setOptions] = useState<VideoOptions>(DEFAULT_VIDEO_OPTIONS);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const uploadRef = useRef<UploadHandle<JobResponse> | null>(null);
  const { active, ready } = useActiveModel();
  const { data: health, connection } = useHealth();
  const { data: runtime } = useRuntimeSettings();
  const client = useQueryClient();
  const invalidateActivity = useInvalidateActivity();
  const localUrl = useObjectUrl(videoFile);

  // A job id in the URL (e.g. from History) takes precedence.
  const urlJob = searchParams.get("job");
  useEffect(() => {
    if (urlJob && urlJob !== videoJobId) setVideoJobId(urlJob);
  }, [urlJob, videoJobId, setVideoJobId]);

  const jobQuery = useJob(videoJobId);
  const job = jobQuery.data ?? null;
  const recent = useHistory({ kind: "video", limit: 6 });

  const finished = isJobFinished(job);
  const notified = useRef<string | null>(null);
  useEffect(() => {
    if (!job || !finished || notified.current === job.id) return;
    if (notified.current === null && job.completed_at && Date.now() - new Date(job.completed_at).getTime() > 15_000) {
      notified.current = job.id; // opened an old job; no toast
      return;
    }
    notified.current = job.id;
    invalidateActivity();
    client.invalidateQueries({ queryKey: queryKeys.models });
    if (job.status === "completed") toast.success("Video processed", { description: `${job.result?.total_detections ?? 0} detections` });
    else if (job.status === "failed") toast.error("Video processing failed", { description: job.error ?? undefined });
  }, [job, finished, invalidateActivity, client]);

  const selectJob = useCallback(
    (id: string | null) => {
      setVideoJobId(id);
      setSearchParams(id ? { job: id } : {}, { replace: true });
    },
    [setVideoJobId, setSearchParams],
  );

  const start = useMutation({
    mutationFn: async (file: File) => {
      setUploadProgress(0);
      const handle = api.startVideoJob(file, { ...params, ...options }, setUploadProgress);
      uploadRef.current = handle;
      try {
        return await handle.promise;
      } finally {
        uploadRef.current = null;
        setUploadProgress(null);
      }
    },
    onSuccess: (created) => {
      notified.current = null;
      client.setQueryData(queryKeys.job(created.id), created);
      selectJob(created.id);
      invalidateActivity();
    },
    onError: (error) => toast.error("Could not start processing", { description: describeError(error) }),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelJob(id),
    onSuccess: (updated) => client.setQueryData(queryKeys.job(updated.id), updated),
    onError: (error) => toast.error("Could not cancel", { description: describeError(error) }),
  });

  const running = job != null && !finished;
  const canStart = Boolean(videoFile) && ready && connection !== "disconnected" && !start.isPending && !running;
  const showLocal = job && videoFile && job.video.filename === videoFile.name ? localUrl : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Video Detection Studio"
        description="Process video files frame by frame in the background and download the annotated result."
        actions={
          job && (
            <Button variant="secondary" onClick={() => selectJob(null)} disabled={start.isPending}>
              <Clapperboard /> New video
            </Button>
          )
        }
      />
      <ModelRequired />

      <div className="grid gap-6 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)]">
        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Video</CardTitle>
              <CardDescription>Up to {health?.limits.max_video_size_mb ?? 1024} MB</CardDescription>
            </CardHeader>
            <CardContent>
              <VideoInput
                file={videoFile}
                onChange={setVideo}
                maxBytes={(health?.limits.max_video_size_mb ?? 1024) * 1024 * 1024}
                disabled={start.isPending}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SlidersHorizontal className="size-4 text-primary" aria-hidden /> Processing settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <InferenceSettingsPanel value={params} onChange={setParams} classNames={active?.class_names ?? []} disabled={start.isPending} compact />
              <div className="border-t pt-5">
                <VideoSettings value={options} onChange={setOptions} disabled={start.isPending} maxFps={runtime?.max_video_fps ?? 30} />
              </div>
              {uploadProgress != null && (
                <div className="space-y-1.5">
                  <Progress value={uploadProgress * 100} aria-label="Upload progress" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {uploadProgress >= 1 ? "Validating video on the server…" : `Uploading ${Math.round(uploadProgress * 100)}%`}
                      {videoFile ? ` of ${formatBytes(videoFile.size)}` : ""}
                    </span>
                    {uploadProgress < 1 && (
                      <button type="button" className="hover:text-foreground" onClick={() => uploadRef.current?.abort()}>
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}
              <Button size="lg" className="w-full" disabled={!canStart} loading={start.isPending} onClick={() => videoFile && start.mutate(videoFile)}>
                {!start.isPending && <Play className="size-5" />}
                {start.isPending ? "Starting…" : running ? "A job is running" : "Start Processing"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          {start.isError && <ErrorState error={start.error} title="Could not start the job" />}
          {jobQuery.isError && !job && <ErrorState error={jobQuery.error} title="Could not load the job" onRetry={() => jobQuery.refetch()} />}
          {videoJobId && jobQuery.isLoading && <Skeleton className="h-48 rounded-2xl" />}
          {job && <JobProgressCard job={job} onCancel={() => cancel.mutate(job.id)} cancelling={cancel.isPending} />}
          {job?.status === "completed" && job.result && <VideoResultView job={job} result={job.result} localUrl={showLocal} />}

          {!job && !jobQuery.isLoading && (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl border bg-elevated text-primary">
                  <Film className="size-5" aria-hidden />
                </div>
                <p className="font-medium">No video job selected</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Choose a video and start processing. Progress is reported from the frames the backend has actually read.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Recent video jobs</CardTitle>
            </CardHeader>
            <CardContent>
              {recent.isLoading ? (
                <Skeleton className="h-24 rounded-xl" />
              ) : !recent.data?.items.length ? (
                <p className="text-sm text-muted-foreground">No video jobs yet.</p>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {recent.data.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => selectJob(item.id)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
                        aria-current={item.id === videoJobId || undefined}
                      >
                        <div className="h-10 w-16 shrink-0 overflow-hidden rounded-md border bg-elevated">
                          {item.artifacts.thumbnail_url && (
                            <img src={apiUrl(item.artifacts.thumbnail_url)} alt="" className="size-full object-cover" loading="lazy" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{item.source_name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {item.num_detections} detections · {formatRelative(item.created_at)}
                          </p>
                        </div>
                        <JobStatusBadge status={item.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
