import { Cpu } from "lucide-react";

import { LabeledSlider } from "@/components/common/LabeledSlider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHealth } from "@/hooks/queries";
import type { DevicePreference, InferenceParams } from "@/types/api";
import { ClassFilter } from "./ClassFilter";

export const IMAGE_SIZES = [320, 416, 480, 512, 640, 736, 832, 960, 1024, 1280];

export function DeviceSelect({
  value,
  onChange,
  disabled,
  id,
}: {
  value: DevicePreference;
  onChange: (value: DevicePreference) => void;
  disabled?: boolean;
  id?: string;
}) {
  const { data: health } = useHealth();
  const cuda = health?.cuda_available ?? false;
  const mps = health?.mps_available ?? false;
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DevicePreference)} disabled={disabled}>
      <SelectTrigger id={id} aria-label="Inference device">
        <span className="flex items-center gap-2">
          <Cpu className="size-4 text-muted-foreground" aria-hidden />
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">Auto ({health?.default_device?.startsWith("cuda") ? "GPU" : "CPU"})</SelectItem>
        <SelectItem value="cpu">CPU</SelectItem>
        <SelectItem value="cuda" disabled={!cuda}>
          CUDA GPU{cuda ? "" : " (unavailable)"}
        </SelectItem>
        {mps && <SelectItem value="mps">Apple MPS</SelectItem>}
      </SelectContent>
    </Select>
  );
}

/** Controls for confidence, IoU, image size, max detections, device and classes. */
export function InferenceSettingsPanel({
  value,
  onChange,
  classNames,
  disabled,
  compact,
}: {
  value: InferenceParams;
  onChange: (value: InferenceParams) => void;
  classNames: string[];
  disabled?: boolean;
  compact?: boolean;
}) {
  const set = <K extends keyof InferenceParams>(key: K, v: InferenceParams[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="space-y-5">
      <LabeledSlider
        label="Confidence threshold"
        hint="Detections below this score are discarded."
        value={value.confidence}
        min={0.05}
        max={1}
        step={0.01}
        onChange={(v) => set("confidence", Math.round(v * 100) / 100)}
        disabled={disabled}
      />
      <LabeledSlider
        label="IoU threshold"
        hint="Non-maximum suppression overlap: lower values merge more overlapping boxes."
        value={value.iou}
        min={0.1}
        max={0.9}
        step={0.01}
        onChange={(v) => set("iou", Math.round(v * 100) / 100)}
        disabled={disabled}
      />
      <div className={compact ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-4 sm:grid-cols-2"}>
        <div className="space-y-2">
          <Label htmlFor="imgsz" className="text-[13px]">
            Image size
          </Label>
          <Select value={String(value.image_size)} onValueChange={(v) => set("image_size", Number(v))} disabled={disabled}>
            <SelectTrigger id="imgsz">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} px
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxdet" className="text-[13px]">
            Max detections
          </Label>
          <Input
            id="maxdet"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            value={value.max_detections}
            disabled={disabled}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) set("max_detections", Math.min(1000, Math.max(1, Math.round(n))));
            }}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="device" className="text-[13px]">
          Device
        </Label>
        <DeviceSelect id="device" value={value.device} onChange={(v) => set("device", v)} disabled={disabled} />
      </div>
      <div className="space-y-2">
        <Label className="text-[13px]">Class filter</Label>
        <ClassFilter classNames={classNames} value={value.classes} onChange={(v) => set("classes", v)} disabled={disabled} />
      </div>
    </div>
  );
}
