import { Boxes, Clock, Cpu, Maximize } from "lucide-react";

import type { ImageInferenceResponse } from "@/types/api";
import { formatMs } from "@/utils/format";

export function ResultSummary({ result }: { result: ImageInferenceResponse }) {
  const items = [
    { icon: Boxes, label: "Detections", value: String(result.count) },
    {
      icon: Clock,
      label: "Inference time",
      value: formatMs(result.timings.inference_ms ?? result.timings.total_ms),
      hint: `${formatMs(result.timings.total_ms)} total`,
    },
    { icon: Maximize, label: "Image size", value: `${result.image.width} × ${result.image.height}`, hint: `inferred at ${result.params.image_size}px` },
    { icon: Cpu, label: "Model", value: result.model.name, hint: result.device },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ icon: Icon, label, value, hint }) => (
        <div key={label} className="min-w-0 rounded-xl border bg-background/40 p-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="size-3.5" aria-hidden /> {label}
          </p>
          <p className="mt-1 truncate text-lg font-semibold tracking-tight" title={value}>
            {value}
          </p>
          {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
        </div>
      ))}
    </div>
  );
}
