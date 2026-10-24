import { ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { ModelInfoPanel } from "@/components/model-manager/ModelInfoPanel";
import { ModelList } from "@/components/model-manager/ModelList";
import { ModelUploader } from "@/components/model-manager/ModelUploader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHealth, useModels } from "@/hooks/queries";

export default function ModelManagerPage() {
  const models = useModels();
  const { data: health } = useHealth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useMemo(() => models.data?.models ?? [], [models.data]);

  useEffect(() => {
    if (!list.length) {
      if (selectedId) setSelectedId(null);
      return;
    }
    if (!selectedId || !list.some((m) => m.id === selectedId)) {
      setSelectedId(models.data?.active_model_id ?? list[0].id);
    }
  }, [list, selectedId, models.data?.active_model_id]);

  const selected = list.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Model Manager"
        description="Upload custom Ultralytics YOLO checkpoints, inspect their real metadata and choose the model used for detection."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload weights</CardTitle>
              <CardDescription>The model is validated, loaded and activated automatically.</CardDescription>
            </CardHeader>
            <CardContent>
              <ModelUploader onUploaded={(m) => setSelectedId(m.id)} />
              <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                {health?.model_security_scan === false
                  ? "Checkpoint scanning is disabled on this server. Only upload files you trust."
                  : "Checkpoints are scanned for unexpected Python imports before loading. PyTorch files can still contain code, so only upload models from sources you trust."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your models</CardTitle>
              <CardDescription>
                Loading a model makes it active for new requests. Running video jobs keep the model they started with.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {models.isError ? (
                <ErrorState error={models.error} title="Could not load models" onRetry={() => models.refetch()} />
              ) : (
                <ModelList models={list} loading={models.isLoading} selectedId={selectedId} onSelect={setSelectedId} />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="xl:sticky xl:top-24 xl:self-start">
          <ModelInfoPanel model={selected} />
        </div>
      </div>
    </div>
  );
}
