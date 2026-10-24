import { Boxes, Cpu, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { ModelStatusBadge } from "@/components/common/StatusBadge";
import { DeviceSelect } from "@/components/detection/InferenceSettingsPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLoadModel } from "@/hooks/queries";
import type { DevicePreference, ModelInfo } from "@/types/api";
import { classColor } from "@/utils/colors";
import { formatBytes, formatCompact, formatDateTime, formatMs, titleCase } from "@/utils/format";

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const missing = value === "Unavailable";
  return (
    <div className="min-w-0 rounded-xl border bg-background/40 px-3 py-2.5">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm [overflow-wrap:anywhere] ${mono ? "font-mono text-[13px]" : "font-medium"} ${missing ? "text-muted-foreground" : ""}`} title={value}>
        {value}
      </dd>
    </div>
  );
}

function show<T>(value: T | null | undefined, format?: (value: T) => string): string {
  return value == null || value === "" ? "Unavailable" : format ? format(value) : String(value);
}

export function ModelInfoPanel({ model }: { model: ModelInfo | null }) {
  const [query, setQuery] = useState("");
  const [device, setDevice] = useState<DevicePreference>("auto");
  const loadModel = useLoadModel();

  const classes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (model?.class_names ?? []).map((name, id) => ({ name, id })).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [model, query]);

  if (!model) {
    return (
      <Card className="h-full">
        <CardContent className="flex h-full items-center p-5 sm:p-6">
          <EmptyState icon={Boxes} title="No model selected" description="Select a model to see its metadata and classes." className="w-full" />
        </CardContent>
      </Card>
    );
  }

  const isLoading = loadModel.isPending && loadModel.variables?.id === model.id;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="truncate" title={model.name}>
            {model.name}
          </CardTitle>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground" title={model.sha256}>
            sha256 {model.sha256.slice(0, 16)}…
          </p>
        </div>
        <ModelStatusBadge status={isLoading ? "loading" : model.status} />
      </CardHeader>
      <CardContent className="space-y-5">
        {model.error && (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {model.error}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <Field label="Task" value={show(model.task, titleCase)} />
          <Field label="Architecture" value={show(model.architecture)} mono />
          <Field label="Classes" value={show(model.num_classes)} />
          <Field label="File size" value={formatBytes(model.file_size_bytes)} />
          <Field label="Parameters" value={show(model.parameters, formatCompact)} />
          <Field label="Device" value={show(model.device)} mono />
          <Field label="Trained image size" value={show(model.trained_image_size, (v: number) => `${v} px`)} />
          <Field label="Ultralytics version" value={show(model.ultralytics_version)} mono />
          <Field label="Load time" value={show(model.load_time_ms, formatMs)} />
          <Field label="Last loaded" value={show(model.last_loaded_at, formatDateTime)} />
          <Field label="Trained" value={show(model.trained_at, formatDateTime)} />
          <Field label="Running jobs" value={String(model.active_jobs)} />
        </dl>

        <div className="flex flex-col gap-2 rounded-xl border bg-background/40 p-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="load-device" className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Cpu className="size-3.5" /> Inference device
            </Label>
            <DeviceSelect id="load-device" value={device} onChange={setDevice} />
          </div>
          <Button
            onClick={() => loadModel.mutate({ id: model.id, device, force_reload: model.status === "loaded" && model.is_active })}
            loading={isLoading}
          >
            {model.status === "loaded" && model.is_active ? "Reload on device" : model.status === "loaded" ? "Activate" : "Load model"}
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-medium">
              Class names <span className="text-muted-foreground">({model.class_names.length})</span>
            </h4>
            {model.class_names.length > 12 && (
              <div className="relative w-40">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter" className="h-8 pl-8 text-xs" aria-label="Filter class names" />
              </div>
            )}
          </div>
          {model.class_names.length === 0 ? (
            <p className="text-sm text-muted-foreground">Class names are unavailable until the model has been loaded.</p>
          ) : (
            <div className="flex max-h-60 flex-wrap gap-1.5 overflow-y-auto pr-1">
              {classes.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1.5 rounded-lg border bg-background/50 px-2 py-1 text-xs">
                  <span className="size-2 rounded-full" style={{ backgroundColor: classColor(c.id) }} aria-hidden />
                  <span className="font-mono text-[10px] text-muted-foreground">{c.id}</span>
                  {c.name}
                </span>
              ))}
              {classes.length === 0 && <p className="text-sm text-muted-foreground">No classes match “{query}”.</p>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
