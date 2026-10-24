import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { LabeledSlider } from "@/components/common/LabeledSlider";
import type { FrameStrategy, OutputQuality, VideoJobSettings } from "@/types/api";

export type VideoOptions = Pick<
  VideoJobSettings,
  "frame_strategy" | "frame_interval" | "target_fps" | "hold_detections" | "max_duration_s" | "output_quality" | "output_max_height"
>;

export const DEFAULT_VIDEO_OPTIONS: VideoOptions = {
  frame_strategy: "every_frame",
  frame_interval: 2,
  target_fps: 10,
  hold_detections: true,
  max_duration_s: null,
  output_quality: "medium",
  output_max_height: null,
};

export function VideoSettings({
  value,
  onChange,
  disabled,
  maxFps,
}: {
  value: VideoOptions;
  onChange: (value: VideoOptions) => void;
  disabled?: boolean;
  maxFps: number;
}) {
  const set = <K extends keyof VideoOptions>(key: K, v: VideoOptions[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="frame-strategy" className="text-[13px]">
          Frame processing
        </Label>
        <Select value={value.frame_strategy} onValueChange={(v) => set("frame_strategy", v as FrameStrategy)} disabled={disabled}>
          <SelectTrigger id="frame-strategy">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="every_frame">Every frame</SelectItem>
            <SelectItem value="interval">Every Nth frame</SelectItem>
            <SelectItem value="target_fps">Target analysis FPS</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          The output keeps every frame. Analysis is capped at {maxFps} FPS by the server settings.
        </p>
      </div>

      {value.frame_strategy === "interval" && (
        <LabeledSlider
          label="Frame interval"
          value={value.frame_interval}
          min={1}
          max={30}
          step={1}
          format={(v) => `every ${v}`}
          onChange={(v) => set("frame_interval", v)}
          disabled={disabled}
        />
      )}
      {value.frame_strategy === "target_fps" && (
        <LabeledSlider
          label="Target FPS"
          value={value.target_fps}
          min={1}
          max={Math.max(1, Math.min(60, maxFps))}
          step={1}
          format={(v) => `${v} fps`}
          onChange={(v) => set("target_fps", v)}
          disabled={disabled}
        />
      )}

      {value.frame_strategy !== "every_frame" && (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="hold" className="text-[13px] leading-snug">
            Keep boxes on skipped frames
            <span className="block text-xs font-normal text-muted-foreground">Avoids flicker between analysed frames</span>
          </Label>
          <Switch id="hold" checked={value.hold_detections} onCheckedChange={(v) => set("hold_detections", v)} disabled={disabled} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="max-duration" className="text-[13px]">
            Max duration (s)
          </Label>
          <Input
            id="max-duration"
            type="number"
            min={1}
            placeholder="Whole video"
            value={value.max_duration_s ?? ""}
            disabled={disabled}
            onChange={(e) => {
              const n = Number(e.target.value);
              set("max_duration_s", e.target.value === "" || !Number.isFinite(n) || n <= 0 ? null : n);
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quality" className="text-[13px]">
            Output quality
          </Label>
          <Select value={value.output_quality} onValueChange={(v) => set("output_quality", v as OutputQuality)} disabled={disabled}>
            <SelectTrigger id="quality">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low (small file)</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="resolution" className="text-[13px]">
          Output resolution
        </Label>
        <Select
          value={value.output_max_height == null ? "original" : String(value.output_max_height)}
          onValueChange={(v) => set("output_max_height", v === "original" ? null : Number(v))}
          disabled={disabled}
        >
          <SelectTrigger id="resolution">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="original">Original</SelectItem>
            <SelectItem value="1080">Up to 1080p</SelectItem>
            <SelectItem value="720">Up to 720p</SelectItem>
            <SelectItem value="480">Up to 480p</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
