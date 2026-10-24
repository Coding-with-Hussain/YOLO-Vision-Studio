import { useMutation } from "@tanstack/react-query";
import { ImageOff, ListChecks, ScanSearch, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { ModelRequired } from "@/components/common/ModelRequired";
import { PageHeader } from "@/components/common/PageHeader";
import { ClassBreakdown } from "@/components/detection/ClassBreakdown";
import { DetectionTable } from "@/components/detection/DetectionTable";
import { InferenceSettingsPanel } from "@/components/detection/InferenceSettingsPanel";
import { ImageInput } from "@/components/image-detection/ImageInput";
import { ResultSummary } from "@/components/image-detection/ResultSummary";
import { ResultsViewer } from "@/components/image-detection/ResultsViewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveModel, useHealth, useInvalidateActivity } from "@/hooks/queries";
import { useInferenceParams } from "@/hooks/useInferenceParams";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { api } from "@/services/api";
import { useWorkspace } from "@/stores/workspace";
import type { InferenceParams } from "@/types/api";
import { classColor } from "@/utils/colors";
import { formatPercent } from "@/utils/format";

export default function ImageDetectionPage() {
  const { imageFile, imageResult, imageParams, setImage, setImageResult, setImageParams } = useWorkspace();
  const [params, setParams] = useInferenceParams(imageParams ?? undefined);
  const { active, ready } = useActiveModel();
  const { data: health, connection } = useHealth();
  const invalidateActivity = useInvalidateActivity();
  const imageUrl = useObjectUrl(imageFile);
  const [highlighted, setHighlighted] = useState<number | null>(null);

  useEffect(() => setImageParams(params), [params, setImageParams]);

  const detect = useMutation({
    mutationFn: (vars: { file: File; params: InferenceParams }) => api.inferImage(vars.file, vars.params),
    onSuccess: (result, vars) => {
      // Ignore results for an image that has since been replaced.
      if (useWorkspace.getState().imageFile !== vars.file) return;
      setImageResult(result);
      invalidateActivity();
      toast.success(`${result.count} object${result.count === 1 ? "" : "s"} detected`, {
        description: `${result.model.name} · ${Math.round(result.timings.inference_ms ?? result.timings.total_ms)} ms`,
      });
    },
    onError: (error) => toast.error("Detection failed", { description: error.message }),
  });

  const canRun = Boolean(imageFile) && ready && connection !== "disconnected" && !detect.isPending;
  const run = () => {
    if (!imageFile || detect.isPending) return;
    detect.mutate({ file: imageFile, params });
  };

  const disabledReason = !imageFile
    ? "Choose an image first"
    : connection === "disconnected"
      ? "Backend offline"
      : !ready
        ? "Load a model first"
        : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Image Detection Studio"
        description="Run your YOLO model on a single image and inspect every detection."
      />
      <ModelRequired />

      <div className="grid gap-6 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)]">
        {/* Input and configuration */}
        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Image</CardTitle>
              <CardDescription>JPG, PNG or WebP</CardDescription>
            </CardHeader>
            <CardContent>
              <ImageInput
                file={imageFile}
                onChange={(f) => {
                  detect.reset();
                  setImage(f);
                }}
                maxBytes={(health?.limits.max_image_size_mb ?? 25) * 1024 * 1024}
                disabled={detect.isPending}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SlidersHorizontal className="size-4 text-primary" aria-hidden /> Detection settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <InferenceSettingsPanel value={params} onChange={setParams} classNames={active?.class_names ?? []} disabled={detect.isPending} compact />
              <Button size="lg" className="w-full" onClick={run} disabled={!canRun} loading={detect.isPending} title={disabledReason ?? undefined}>
                {!detect.isPending && <ScanSearch className="size-5" />}
                {detect.isPending ? "Detecting…" : "Run Object Detection"}
              </Button>
              {disabledReason && !detect.isPending && <p className="-mt-3 text-center text-xs text-muted-foreground">{disabledReason}</p>}
            </CardContent>
          </Card>
        </div>

        {/* Results */}
        <div className="min-w-0 space-y-6">
          <Card>
            <CardContent className="space-y-5 p-4 sm:p-6">
              {detect.isError && <ErrorState error={detect.error} title="Detection failed" onRetry={canRun ? run : undefined} />}
              {imageResult && <ResultSummary result={imageResult} />}
              <ResultsViewer
                imageUrl={imageUrl}
                result={imageResult}
                running={detect.isPending}
                highlighted={highlighted}
                onHover={setHighlighted}
              />
            </CardContent>
          </Card>

          {imageResult && imageResult.count === 0 && (
            <EmptyState
              icon={ImageOff}
              title="No objects detected"
              description={`Nothing scored above the ${formatPercent(imageResult.params.confidence, 0)} confidence threshold${
                imageResult.params.classes?.length ? " for the selected classes" : ""
              }. Try lowering the threshold or a larger image size.`}
            />
          )}

          {imageResult && imageResult.count > 0 && (
            <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_300px]">
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ListChecks className="size-4 text-primary" aria-hidden /> Detection results
                  </CardTitle>
                  <CardDescription>Bounding boxes in pixels of the original image. Hover a row to highlight it.</CardDescription>
                </CardHeader>
                <CardContent>
                  <DetectionTable detections={imageResult.detections} highlighted={highlighted} onHover={setHighlighted} />
                </CardContent>
              </Card>
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>Objects by class</CardTitle>
                  <CardDescription>{Object.keys(imageResult.class_counts).length} classes detected</CardDescription>
                </CardHeader>
                <CardContent>
                  <ClassBreakdown
                    rows={Object.entries(imageResult.class_counts).map(([name, count]) => ({ name, count }))}
                    colorFor={(row) => {
                      const det = imageResult.detections.find((d) => d.class_name === row.name);
                      return det ? classColor(det.class_id) : undefined;
                    }}
                  />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
