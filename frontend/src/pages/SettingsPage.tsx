import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, HardDrive, Monitor, Moon, RotateCcw, Save, Server, SlidersHorizontal, Sparkles, Sun, Trash2, XCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ConnectionBadge } from "@/components/common/ConnectionIndicator";
import { ErrorState, InlineError } from "@/components/common/ErrorState";
import { LabeledSlider } from "@/components/common/LabeledSlider";
import { PageHeader } from "@/components/common/PageHeader";
import { DeviceSelect, IMAGE_SIZES } from "@/components/detection/InferenceSettingsPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useHealth, useRuntimeSettings, useStorage, useUpdateRuntimeSettings } from "@/hooks/queries";
import { cn } from "@/lib/utils";
import { api, defaultApiBaseUrl, describeError, getApiBaseUrl } from "@/services/api";
import { usePreferences, type ThemePreference } from "@/stores/preferences";
import type { RuntimeSettings } from "@/types/api";
import { formatBytes, formatDateTime, formatDuration, formatMs } from "@/utils/format";

function Section({ icon: Icon, title, description, scope, children }: { icon: typeof Server; title: string; description: string; scope: "backend" | "browser"; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-4" aria-hidden />
          </div>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
        </div>
        <Badge variant={scope === "backend" ? "cyan" : "secondary"} className="shrink-0">
          {scope === "backend" ? "Saved on backend" : "This browser only"}
        </Badge>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  suffix,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
  hint?: string;
}) {
  const invalid = !Number.isFinite(value) || value < min || value > max;
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-[13px]">
        {label}
      </Label>
      <div className="relative">
        <Input id={id} type="number" min={min} max={max} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} aria-invalid={invalid} className={suffix ? "pr-14" : undefined} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
      </div>
      <p className={cn("text-xs", invalid ? "text-destructive" : "text-muted-foreground")}>{invalid ? `Enter a value between ${min} and ${max}.` : hint}</p>
    </div>
  );
}

const NUMERIC_LIMITS: Partial<Record<keyof RuntimeSettings, [number, number]>> = {
  default_max_detections: [1, 1000],
  max_video_fps: [1, 240],
  output_retention_hours: [1, 8760],
  upload_retention_hours: [0, 8760],
  cleanup_interval_minutes: [5, 1440],
  history_max_entries: [10, 100000],
};

function validate(form: RuntimeSettings): string | null {
  for (const [key, [min, max]] of Object.entries(NUMERIC_LIMITS) as [keyof RuntimeSettings, [number, number]][]) {
    const v = form[key] as number;
    if (!Number.isFinite(v) || v < min || v > max) return `Check the highlighted fields before saving.`;
  }
  return null;
}

function BackendSettingsForm({ settings }: { settings: RuntimeSettings }) {
  const [form, setForm] = useState(settings);
  const update = useUpdateRuntimeSettings();
  useEffect(() => setForm(settings), [settings]);
  const set = <K extends keyof RuntimeSettings>(key: K, value: RuntimeSettings[K]) => setForm((f) => ({ ...f, [key]: value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);
  const problem = validate(form);
  const save = () =>
    update.mutate(form, {
      onSuccess: () => toast.success("Settings saved"),
      onError: (error) => toast.error("Settings were not saved", { description: describeError(error) }),
    });
  const reset = useMutation({
    mutationFn: api.resetSettings,
    onSuccess: (s) => {
      setForm(s);
      update.reset();
      toast.success("Defaults restored");
    },
  });

  const actions = (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
      {update.isError && <InlineError message={describeError(update.error)} className="mr-auto" />}
      <Button variant="ghost" onClick={() => reset.mutate()} loading={reset.isPending}>
        <RotateCcw /> Restore defaults
      </Button>
      <Button variant="secondary" onClick={() => setForm(settings)} disabled={!dirty}>
        Discard
      </Button>
      <Button onClick={save} disabled={!dirty || Boolean(problem)} loading={update.isPending}>
        <Save /> Save changes
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <Section icon={SlidersHorizontal} title="Inference" description="Defaults for new image, video and live sessions." scope="backend">
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <LabeledSlider label="Default confidence threshold" value={form.default_confidence} min={0.05} max={1} step={0.01} onChange={(v) => set("default_confidence", Math.round(v * 100) / 100)} />
            <LabeledSlider label="Default IoU threshold" value={form.default_iou} min={0.1} max={0.9} step={0.01} onChange={(v) => set("default_iou", Math.round(v * 100) / 100)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="default-imgsz" className="text-[13px]">
                Default image size
              </Label>
              <Select value={String(form.default_image_size)} onValueChange={(v) => set("default_image_size", Number(v))}>
                <SelectTrigger id="default-imgsz">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_SIZES.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s} px
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pref-device" className="text-[13px]">
                Preferred device
              </Label>
              <DeviceSelect id="pref-device" value={form.preferred_device} onChange={(v) => set("preferred_device", v)} />
            </div>
            <NumberField id="max-det" label="Max detections" value={form.default_max_detections} min={1} max={1000} onChange={(v) => set("default_max_detections", v)} hint="Per image or frame" />
            <NumberField id="max-fps" label="Max video processing FPS" value={form.max_video_fps} min={1} max={240} suffix="fps" onChange={(v) => set("max_video_fps", v)} hint="Caps frames analysed per second of video" />
          </div>
        </div>
      </Section>

      <StorageSection form={form} set={set} />
      {actions}
    </div>
  );
}

function StorageSection({ form, set }: { form: RuntimeSettings; set: <K extends keyof RuntimeSettings>(key: K, value: RuntimeSettings[K]) => void }) {
  const storage = useStorage();
  const cleanup = useMutation({
    mutationFn: api.cleanup,
    onSuccess: (r) => {
      toast.success("Cleanup finished", { description: `${r.removed_files} files removed · ${formatBytes(r.freed_bytes)} freed` });
      storage.refetch();
    },
    onError: (error) => toast.error("Cleanup failed", { description: describeError(error) }),
  });
  return (
    <Section icon={HardDrive} title="Storage" description="Where results are kept and for how long. Paths are never exposed by the API." scope="backend">
      <div className="space-y-6">
        {storage.isLoading ? (
          <Skeleton className="h-24" />
        ) : storage.isError ? (
          <ErrorState error={storage.error} title="Storage status unavailable" onRetry={() => storage.refetch()} />
        ) : (
          storage.data && (
            <div className="grid gap-3 sm:grid-cols-3">
              {storage.data.areas.map((area) => (
                <div key={area.name} className="rounded-xl border bg-background/40 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium capitalize">{area.name}</p>
                    {area.exists && area.writable ? (
                      <span className="flex items-center gap-1 text-xs text-success">
                        <CheckCircle2 className="size-3.5" aria-hidden /> Writable
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-destructive">
                        <XCircle className="size-3.5" aria-hidden /> {area.exists ? "Read-only" : "Missing"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-lg font-semibold">{formatBytes(area.size_bytes)}</p>
                  <p className="text-xs text-muted-foreground">
                    {area.file_count} file{area.file_count === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
          )
        )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <NumberField id="out-ret" label="Output retention" value={form.output_retention_hours} min={1} max={8760} suffix="hours" onChange={(v) => set("output_retention_hours", v)} hint={Number.isFinite(form.output_retention_hours) ? `≈ ${formatDuration(form.output_retention_hours * 3600)}` : undefined} />
          <NumberField id="up-ret" label="Uploaded video retention" value={form.upload_retention_hours} min={0} max={8760} suffix="hours" onChange={(v) => set("upload_retention_hours", v)} hint="0 removes inputs at the next cleanup" />
          <NumberField id="cleanup" label="Cleanup interval" value={form.cleanup_interval_minutes} min={5} max={1440} suffix="min" onChange={(v) => set("cleanup_interval_minutes", v)} hint="Takes effect after the next run" />
          <NumberField id="hist-max" label="History size limit" value={form.history_max_entries} min={10} max={100000} suffix="entries" onChange={(v) => set("history_max_entries", v)} hint="Oldest entries are removed first" />
        </div>
        <div className="flex flex-col gap-4 rounded-xl border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={form.save_image_results} onCheckedChange={(v) => set("save_image_results", v)} className="mt-0.5" />
            <span>
              Keep image results on the server
              <span className="block text-xs text-muted-foreground">When off, annotated images are returned once and not stored.</span>
            </span>
          </label>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">Last cleanup: {formatDateTime(storage.data?.last_cleanup_at)}</p>
            <Button variant="secondary" onClick={() => cleanup.mutate()} loading={cleanup.isPending}>
              {!cleanup.isPending && <Trash2 />} Run cleanup now
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}

function BackendSection() {
  const apiOverride = usePreferences((s) => s.apiBaseUrl);
  const setApiBaseUrl = usePreferences((s) => s.setApiBaseUrl);
  const [url, setUrl] = useState(apiOverride ?? getApiBaseUrl());
  const health = useHealth();
  const [check, setCheck] = useState<{ ok: boolean; ms: number; message: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const invalidUrl = url.trim() !== "" && !/^https?:\/\/[^\s]+$/i.test(url.trim());

  const runCheck = async () => {
    setChecking(true);
    const started = performance.now();
    try {
      const res = await api.health();
      setCheck({ ok: true, ms: performance.now() - started, message: `${res.app} ${res.version} responded (${res.status})` });
    } catch (error) {
      setCheck({ ok: false, ms: performance.now() - started, message: describeError(error) });
    } finally {
      setChecking(false);
      health.refetch();
    }
  };

  const h = health.data;
  return (
    <Section icon={Server} title="Backend" description="Connection to the FastAPI inference server." scope="browser">
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="api-url" className="text-[13px]">
            API base URL
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="api-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:8000" aria-invalid={invalidUrl} />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={invalidUrl}
                onClick={() => {
                  setApiBaseUrl(url.trim() === defaultApiBaseUrl() ? null : url.trim());
                  toast.success("API URL updated");
                }}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setApiBaseUrl(null);
                  setUrl(defaultApiBaseUrl());
                }}
              >
                Use default
              </Button>
            </div>
          </div>
          <p className={cn("text-xs", invalidUrl ? "text-destructive" : "text-muted-foreground")}>
            {invalidUrl
              ? "Enter a URL starting with http:// or https://"
              : `Default from VITE_API_BASE_URL: ${defaultApiBaseUrl() || "same origin"}. Leave empty to use the page's origin.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ConnectionBadge state={health.connection} />
          <Button variant="secondary" size="sm" onClick={runCheck} loading={checking}>
            Run health check
          </Button>
          {check && (
            <span className={cn("text-xs", check.ok ? "text-success" : "text-destructive")}>
              {check.message} · {formatMs(check.ms)}
            </span>
          )}
        </div>
        {h && (
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {[
              ["Backend version", h.version],
              ["Ultralytics", h.ultralytics_version ?? "Not installed"],
              ["PyTorch", h.torch_version ?? "Not installed"],
              ["OpenCV", h.opencv_version ?? "Not installed"],
              ["Python", h.python_version],
              ["Default device", h.default_device],
              ["CUDA", h.cuda_available ? h.devices.filter((d) => d.type === "cuda").map((d) => d.name).join(", ") : "Unavailable"],
              ["Video encoder", h.video_encoder],
              ["Checkpoint scan", h.model_security_scan ? "Enabled" : "Disabled"],
              ["Max model size", `${h.limits.max_model_size_mb} MB`],
              ["Max image size", `${h.limits.max_image_size_mb} MB`],
              ["Max video size", `${h.limits.max_video_size_mb} MB`],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-xl border bg-background/40 p-2.5">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                <dd className="truncate text-sm font-medium" title={value}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {h?.issues.length ? (
          <ul className="space-y-1 text-sm text-warning">
            {h.issues.map((issue) => (
              <li key={issue}>• {issue}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </Section>
  );
}

const THEMES: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];

function InterfaceSection() {
  const prefs = usePreferences();
  return (
    <Section icon={Sparkles} title="Interface" description="Appearance and result display preferences." scope="browser">
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-[13px] font-medium">Theme</p>
          <div className="grid max-w-md grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={prefs.theme === value}
                onClick={() => prefs.setTheme(value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm transition-colors hover:border-input",
                  prefs.theme === value && "border-primary/50 bg-primary/10 text-primary",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { label: "Collapse sidebar on desktop", checked: prefs.sidebarCollapsed, onChange: prefs.setSidebarCollapsed },
            { label: "Show bounding boxes", checked: prefs.display.showBoxes, onChange: (v: boolean) => prefs.setDisplay({ showBoxes: v }) },
            { label: "Show class labels", checked: prefs.display.showLabels, onChange: (v: boolean) => prefs.setDisplay({ showLabels: v }) },
            { label: "Show confidence scores", checked: prefs.display.showConfidence, onChange: (v: boolean) => prefs.setDisplay({ showConfidence: v }) },
            { label: "Mirror live camera preview", checked: prefs.liveMirror, onChange: prefs.setLiveMirror },
          ].map((row) => (
            <label key={row.label} className="flex items-center justify-between gap-3 rounded-xl border bg-background/40 px-3 py-2.5 text-sm">
              {row.label}
              <Switch checked={row.checked} onCheckedChange={row.onChange} />
            </label>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={prefs.reset}>
          <RotateCcw /> Reset interface preferences
        </Button>
      </div>
    </Section>
  );
}

export default function SettingsPage() {
  const settings = useRuntimeSettings();
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Server-side defaults are shared by every client of this backend. Interface preferences stay in this browser." />
      {settings.isLoading ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : settings.isError ? (
        <ErrorState error={settings.error} title="Backend settings are unavailable" onRetry={() => settings.refetch()} />
      ) : (
        settings.data && <BackendSettingsForm settings={settings.data} />
      )}
      <BackendSection />
      <InterfaceSection />
    </div>
  );
}
