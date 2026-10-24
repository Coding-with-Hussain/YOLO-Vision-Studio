import { Film, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Dropzone } from "@/components/common/Dropzone";
import { InlineError } from "@/components/common/ErrorState";
import { Button } from "@/components/ui/button";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { formatBytes, formatDuration } from "@/utils/format";

export const VIDEO_EXTENSIONS = ["mp4", "m4v", "webm", "mov", "mkv", "avi"];

export interface LocalVideoMeta {
  duration: number | null;
  width: number | null;
  height: number | null;
  playable: boolean;
}

export function VideoInput({
  file,
  onChange,
  maxBytes,
  disabled,
  onMeta,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  maxBytes: number;
  disabled?: boolean;
  onMeta?: (meta: LocalVideoMeta) => void;
}) {
  const url = useObjectUrl(file);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<LocalVideoMeta | null>(null);

  useEffect(() => setMeta(null), [file]);
  useEffect(() => {
    if (meta) onMeta?.(meta);
  }, [meta, onMeta]);

  if (!file || !url) {
    return (
      <div className="space-y-3">
        <Dropzone
          icon={Film}
          title="Drop a video to process"
          subtitle="MP4, WebM or MOV work best"
          extensions={VIDEO_EXTENSIONS}
          accept="video/*,.mkv,.avi,.mov"
          maxBytes={maxBytes}
          onFile={(f) => {
            setError(null);
            onChange(f);
          }}
          onReject={setError}
          disabled={disabled}
          compact
        />
        {error && <InlineError message={error} />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border bg-black">
        <video
          src={url}
          controls
          playsInline
          muted
          preload="metadata"
          className="mx-auto max-h-64 w-full"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setMeta({
              duration: Number.isFinite(v.duration) ? v.duration : null,
              width: v.videoWidth || null,
              height: v.videoHeight || null,
              playable: true,
            });
          }}
          onError={() => setMeta({ duration: null, width: null, height: null, playable: false })}
        />
      </div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={file.name}>
            {file.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {[
              formatBytes(file.size),
              meta?.duration != null ? formatDuration(meta.duration) : null,
              meta?.width && meta.height ? `${meta.width} × ${meta.height}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Button variant="destructive-ghost" size="icon-sm" onClick={() => onChange(null)} disabled={disabled} aria-label="Remove video">
          <Trash2 />
        </Button>
      </div>
      {meta && !meta.playable && (
        <p className="rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-xs text-warning">
          Your browser cannot preview this file. The backend may still be able to decode it; duration and resolution will be
          read on the server.
        </p>
      )}
      {error && <InlineError message={error} />}
    </div>
  );
}
