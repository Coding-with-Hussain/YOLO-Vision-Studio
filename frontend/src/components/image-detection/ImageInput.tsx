import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Dropzone, validateFile } from "@/components/common/Dropzone";
import { InlineError } from "@/components/common/ErrorState";
import { Button } from "@/components/ui/button";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { formatBytes } from "@/utils/format";

export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

export function ImageInput({
  file,
  onChange,
  maxBytes,
  disabled,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  maxBytes: number;
  disabled?: boolean;
}) {
  const url = useObjectUrl(file);
  const [error, setError] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDims(null), [file]);

  if (!file || !url) {
    return (
      <div className="space-y-3">
        <Dropzone
          icon={ImagePlus}
          title="Drop an image to analyse"
          subtitle="Drag & drop or browse for a photo"
          extensions={IMAGE_EXTENSIONS}
          accept="image/jpeg,image/png,image/webp"
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
      <div className="checkerboard relative overflow-hidden rounded-xl border">
        <img
          src={url}
          alt={`Preview of ${file.name}`}
          className="mx-auto max-h-72 w-full object-contain"
          onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          onError={() => setError("The browser could not display this image. It may be corrupted.")}
        />
      </div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={file.name}>
            {file.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatBytes(file.size)}
            {dims ? ` · ${dims.w} × ${dims.h}px` : ""}
          </p>
        </div>
        <Button variant="secondary" size="icon-sm" onClick={() => replaceRef.current?.click()} disabled={disabled} aria-label="Replace image">
          <RefreshCw />
        </Button>
        <Button variant="destructive-ghost" size="icon-sm" onClick={() => onChange(null)} disabled={disabled} aria-label="Remove image">
          <Trash2 />
        </Button>
        <input
          ref={replaceRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const next = e.target.files?.[0];
            e.target.value = "";
            if (!next) return;
            const problem = validateFile(next, IMAGE_EXTENSIONS, maxBytes);
            if (problem) setError(problem);
            else {
              setError(null);
              onChange(next);
            }
          }}
        />
      </div>
      {error && <InlineError message={error} />}
    </div>
  );
}
