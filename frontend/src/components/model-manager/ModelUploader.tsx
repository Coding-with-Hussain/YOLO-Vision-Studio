import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, FileBox, ShieldAlert, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Dropzone } from "@/components/common/Dropzone";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { queryKeys, useHealth, useLoadModel } from "@/hooks/queries";
import { ApiError, api, describeError } from "@/services/api";
import type { ModelInfo } from "@/types/api";
import { formatBytes } from "@/utils/format";

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; file: File; progress: number }
  | { kind: "validating"; file: File }
  | { kind: "done"; file: File; model: ModelInfo }
  | { kind: "error"; file: File | null; error: ApiError | Error };

export function ModelUploader({ onUploaded }: { onUploaded?: (model: ModelInfo) => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef<(() => void) | null>(null);
  const client = useQueryClient();
  const { data: health } = useHealth();
  const loadModel = useLoadModel();
  const maxBytes = (health?.limits.max_model_size_mb ?? 512) * 1024 * 1024;
  const busy = phase.kind === "uploading" || phase.kind === "validating";

  const start = async (file: File) => {
    setPhase({ kind: "uploading", file, progress: 0 });
    const handle = api.uploadModel(file, (fraction) => {
      setPhase((p) =>
        p.kind === "uploading"
          ? fraction >= 1
            ? { kind: "validating", file }
            : { ...p, progress: fraction }
          : p,
      );
    });
    abortRef.current = handle.abort;
    try {
      const model = await handle.promise;
      setPhase({ kind: "done", file, model });
      toast.success(`${model.name} loaded`, {
        description: `${model.num_classes ?? "?"} classes · ${model.task ?? "unknown task"} · ${model.device ?? ""}`,
      });
      onUploaded?.(model);
    } catch (error) {
      setPhase({ kind: "error", file, error: error as Error });
    } finally {
      abortRef.current = null;
      client.invalidateQueries({ queryKey: queryKeys.models });
      client.invalidateQueries({ queryKey: ["health"] });
    }
  };

  const existingId =
    phase.kind === "error" && phase.error instanceof ApiError && phase.error.code === "MODEL_ALREADY_EXISTS"
      ? (phase.error.details.model_id as string | undefined)
      : undefined;
  const offending =
    phase.kind === "error" && phase.error instanceof ApiError ? (phase.error.details.offending as string[] | undefined) : undefined;

  return (
    <div className="space-y-4">
      <Dropzone
        icon={UploadCloud}
        title="Drop your YOLO model here"
        subtitle="Upload a trained PyTorch model (.pt)"
        extensions={["pt"]}
        accept=".pt"
        maxBytes={maxBytes}
        disabled={busy}
        onFile={start}
        onReject={(message) => setPhase({ kind: "error", file: null, error: new Error(message) })}
      />

      <AnimatePresence initial={false}>
        {phase.kind !== "idle" && (
          <motion.div
            key="status"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border bg-card p-4" aria-live="polite">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {phase.kind === "error" ? (
                    <ShieldAlert className="size-5 text-destructive" aria-hidden />
                  ) : phase.kind === "done" ? (
                    <CheckCircle2 className="size-5 text-success" aria-hidden />
                  ) : (
                    <FileBox className="size-5" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium" title={"file" in phase && phase.file ? phase.file.name : undefined}>
                      {"file" in phase && phase.file ? phase.file.name : "File not accepted"}
                    </p>
                    {"file" in phase && phase.file && (
                      <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(phase.file.size)}</span>
                    )}
                  </div>
                  {phase.kind === "uploading" && (
                    <>
                      <Progress value={phase.progress * 100} aria-label="Upload progress" />
                      <p className="text-xs text-muted-foreground">Uploading… {Math.round(phase.progress * 100)}%</p>
                    </>
                  )}
                  {phase.kind === "validating" && (
                    <>
                      <Progress value={null} aria-label="Validating model" />
                      <p className="text-xs text-muted-foreground">
                        Upload complete. Scanning the checkpoint, loading it with Ultralytics and running a test inference…
                      </p>
                    </>
                  )}
                  {phase.kind === "done" && (
                    <p className="text-sm text-success">
                      Validated and loaded: {phase.model.task ?? "unknown task"}, {phase.model.num_classes ?? "?"} classes on{" "}
                      {phase.model.device}.
                    </p>
                  )}
                  {phase.kind === "error" && (
                    <div className="space-y-2">
                      <p className="text-sm text-destructive [overflow-wrap:anywhere]">{describeError(phase.error)}</p>
                      {phase.error instanceof ApiError && phase.error.code && phase.error.code !== "HTTP_ERROR" && (
                        <p className="font-mono text-[11px] text-muted-foreground">Error code: {phase.error.code}</p>
                      )}
                      {offending && offending.length > 0 && (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer hover:text-foreground">Rejected references ({offending.length})</summary>
                          <ul className="mt-1 space-y-0.5 font-mono">
                            {offending.map((o) => (
                              <li key={o} className="[overflow-wrap:anywhere]">
                                {o}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      {existingId && (
                        <Button size="sm" variant="secondary" onClick={() => loadModel.mutate({ id: existingId })} loading={loadModel.isPending}>
                          Load the existing copy
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {phase.kind === "uploading" ? (
                  <Button variant="ghost" size="icon-sm" onClick={() => abortRef.current?.()} aria-label="Cancel upload">
                    <X />
                  </Button>
                ) : (
                  phase.kind !== "validating" && (
                    <Button variant="ghost" size="icon-sm" onClick={() => setPhase({ kind: "idle" })} aria-label="Dismiss">
                      <X />
                    </Button>
                  )
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
