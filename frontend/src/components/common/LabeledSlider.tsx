import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tooltip } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { useId } from "react";

export function LabeledSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format = (v) => v.toFixed(2),
  hint,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="flex items-center gap-1.5 text-[13px]">
          {label}
          {hint && (
            <Tooltip content={hint}>
              <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={`About ${label}`}>
                <Info className="size-3.5" />
              </button>
            </Tooltip>
          )}
        </Label>
        <span className="tabular rounded-md border bg-background/60 px-2 py-0.5 font-mono text-xs">{format(value)}</span>
      </div>
      <Slider
        id={id}
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
        disabled={disabled}
      />
    </div>
  );
}
