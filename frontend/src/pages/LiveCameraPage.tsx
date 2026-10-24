import { Camera, CameraOff, Pause, Radio, ScanEye, SlidersHorizontal, Video, VideoOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { InlineError } from "@/components/common/ErrorState";
import { LabeledSlider } from "@/components/common/LabeledSlider";
import { ModelRequired } from "@/components/common/ModelRequired";
import { PageHeader } from "@/components/common/PageHeader";
import { InferenceSettingsPanel } from "@/components/detection/InferenceSettingsPanel";
import { OverlayToggles } from "@/components/detection/OverlayToggles";
import { LiveSidePanel } from "@/components/live-camera/LiveSidePanel";
import { LiveViewport, type DisplayMode, type LiveViewportHandle } from "@/components/live-camera/LiveViewport";
import { useCamera } from "@/components/live-camera/useCamera";
import { useLiveDetection } from "@/components/live-camera/useLiveDetection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveModel, useHealth, useInvalidateActivity } from "@/hooks/queries";
import { useInferenceParams } from "@/hooks/useInferenceParams";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/stores/preferences";
import { canvasToBlob, downloadBlob, timestampedName } from "@/utils/drawDetections";
import { formatMs } from "@/utils/format";

type Indicator = { label: string; tone: "secondary" | "warning" | "success" | "default" | "destructive" };

export default function LiveCameraPage() {
  const camera = useCamera();
  const [params, setParams] = useInferenceParams();
  const [targetFps, setTargetFps] = useState(8);
  const [captureWidth, setCaptureWidth] = useState(640);
  const [jpegQuality, setJpegQuality] = useState(0.8);
  const [mode, setMode] = useState<DisplayMode>("synced");
  const mirrored = usePreferences((s) => s.liveMirror);
  const setMirrored = usePreferences((s) => s.setLiveMirror);
  const display = usePreferences((s) => s.display);
  const { active, ready } = useActiveModel();
  const { connection } = useHealth();
  const invalidateActivity = useInvalidateActivity();
  const viewport = useRef<LiveViewportHandle>(null);
  const hiddenClasses = useMemo(() => new Set<number>(), []);

  const live = useLiveDetection(camera.videoRef, params, {
    targetFps,
    captureWidth,
    jpegQuality,
    keepBitmaps: mode === "synced",
  });

  const cameraOn = camera.status === "ready";
  const detecting = live.running && cameraOn;

  // Stopping the camera ends the session (the backend saves it to history).
  const { socketStatus, disconnect } = live;
  useEffect(() => {
    if (!cameraOn && socketStatus !== "idle") {
      disconnect();
      invalidateActivity();
    }
  }, [cameraOn, socketStatus, disconnect, invalidateActivity]);

  const indicator: Indicator =
    camera.status === "error"
      ? { label: "Error", tone: "destructive" }
      : camera.status === "requesting"
        ? { label: "Requesting Permission", tone: "warning" }
        : detecting
          ? { label: "Running Detection", tone: "success" }
          : cameraOn
            ? { label: "Camera Ready", tone: "default" }
            : { label: "Camera Off", tone: "secondary" };

  const aspect = camera.resolution?.width && camera.resolution.height ? camera.resolution.width / camera.resolution.height : 16 / 9;

  const screenshot = async () => {
    const canvas = viewport.current?.canvas;
    if (!canvas || !canvas.width) return;
    try {
      downloadBlob(await canvasToBlob(canvas), timestampedName("yolo-capture", "png"));
      toast.success("Screenshot saved");
    } catch {
      toast.error("Could not capture the frame");
    }
  };

  const detectionsNow = detecting ? (live.result?.detections ?? []) : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Live Camera Detection" description="Stream your webcam to the backend and see real YOLO detections in real time." />
      <ModelRequired />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Card className="overflow-hidden">
            <div className="relative bg-black">
              <div className="relative mx-auto w-full" style={{ aspectRatio: String(aspect), maxWidth: `calc(68vh * ${aspect})` }}>
                <video
                  ref={camera.videoRef}
                  playsInline
                  muted
                  className="absolute inset-0 size-full object-contain opacity-0"
                  onLoadedMetadata={(e) => camera.setResolution({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })}
                  aria-hidden
                />
                <LiveViewport
                  ref={viewport}
                  videoRef={camera.videoRef}
                  result={live.result}
                  detecting={detecting}
                  mode={mode}
                  mirrored={mirrored}
                  display={display}
                  hiddenClasses={hiddenClasses}
                  active={cameraOn}
                />
                {!cameraOn && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_center,rgb(var(--primary)/0.12),transparent_70%)] p-6 text-center">
                    <div className="flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80">
                      {camera.status === "error" ? <CameraOff className="size-6" aria-hidden /> : <Camera className="size-6" aria-hidden />}
                    </div>
                    <p className="font-medium text-white">
                      {camera.status === "requesting" ? "Waiting for camera permission…" : camera.status === "error" ? "Camera unavailable" : "Camera is off"}
                    </p>
                    <p className="max-w-sm text-sm text-white/60">
                      {camera.status === "error" && camera.error
                        ? camera.error
                        : "Your browser asks for permission when you start the camera. Frames are only sent to your own backend."}
                    </p>
                  </div>
                )}
              </div>

              <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
                <Badge variant={indicator.tone} className="pointer-events-auto bg-black/60 backdrop-blur" role="status">
                  <span className={cn("size-1.5 rounded-full bg-current", detecting && "animate-pulse")} aria-hidden />
                  {indicator.label}
                </Badge>
                {detecting && (
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Badge variant="secondary" className="bg-black/60 font-mono text-white backdrop-blur">
                      {live.stats.fps.toFixed(1)} FPS
                    </Badge>
                    <Badge variant="secondary" className="bg-black/60 font-mono text-white backdrop-blur">
                      {formatMs(live.stats.avgLatencyMs)}
                    </Badge>
                    <Badge variant="secondary" className="bg-black/60 font-mono text-white backdrop-blur">
                      {detectionsNow.length} objects
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            <CardContent className="space-y-3 border-t p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                {!cameraOn ? (
                  <Button onClick={() => camera.start()} loading={camera.status === "requesting"}>
                    {camera.status !== "requesting" && <Video />} Start Camera
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={camera.stop}>
                    <VideoOff /> Stop Camera
                  </Button>
                )}
                {detecting ? (
                  <Button variant="secondary" onClick={live.pauseDetection}>
                    <Pause /> Pause Detection
                  </Button>
                ) : (
                  <Button
                    onClick={live.startDetection}
                    disabled={!cameraOn || !ready || connection === "disconnected"}
                    loading={live.socketStatus === "connecting"}
                  >
                    {live.socketStatus !== "connecting" && <Radio />} Start Detection
                  </Button>
                )}
                <Button variant="secondary" onClick={screenshot} disabled={!cameraOn}>
                  <ScanEye /> Capture Screenshot
                </Button>
                {camera.devices.length > 1 && (
                  <Select value={camera.deviceId ?? undefined} onValueChange={(id) => camera.start(id)}>
                    <SelectTrigger className="h-10 w-full sm:ml-auto sm:w-56" aria-label="Camera">
                      <SelectValue placeholder="Select camera" />
                    </SelectTrigger>
                    <SelectContent>
                      {camera.devices.map((d, i) => (
                        <SelectItem key={d.deviceId || i} value={d.deviceId || `camera-${i}`}>
                          {d.label || `Camera ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <OverlayToggles />
                <Tabs value={mode} onValueChange={(v) => setMode(v as DisplayMode)}>
                  <TabsList aria-label="Display mode">
                    <TabsTrigger value="synced" title="Show the analysed frame with its exact detections">
                      Synced
                    </TabsTrigger>
                    <TabsTrigger value="live" title="Smooth live video with the latest detections">
                      Smooth
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={mirrored} onCheckedChange={setMirrored} aria-label="Mirror preview" />
                  Mirror
                </label>
              </div>
              {live.error && <InlineError message={live.error} />}
              {!ready && cameraOn && <p className="text-xs text-muted-foreground">Load a model in the Model Manager to start detection.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SlidersHorizontal className="size-4 text-primary" aria-hidden /> Live settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-5">
                  <LabeledSlider
                    label="Inference frame rate"
                    hint="Upper limit; the effective rate drops automatically when the backend is slower."
                    value={targetFps}
                    min={1}
                    max={30}
                    step={1}
                    format={(v) => `${v} fps`}
                    onChange={setTargetFps}
                  />
                  <LabeledSlider label="JPEG quality" value={jpegQuality} min={0.5} max={0.95} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={setJpegQuality} />
                  <div className="space-y-2">
                    <Label htmlFor="capture-width" className="text-[13px]">
                      Capture resolution
                    </Label>
                    <Select value={String(captureWidth)} onValueChange={(v) => setCaptureWidth(Number(v))}>
                      <SelectTrigger id="capture-width">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[320, 480, 640, 960, 1280].map((w) => (
                          <SelectItem key={w} value={String(w)}>
                            {w}px wide
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Smaller frames upload faster. Boxes are scaled back to the preview.</p>
                  </div>
                </div>
                <InferenceSettingsPanel value={params} onChange={setParams} classNames={active?.class_names ?? []} compact />
              </div>
            </CardContent>
          </Card>
        </div>

        <LiveSidePanel stats={live.stats} detections={detectionsNow} events={live.events} />
      </div>
    </div>
  );
}
