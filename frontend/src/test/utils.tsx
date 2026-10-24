import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import { AppProviders } from "@/AppProviders";
import { api } from "@/services/api";
import type { HealthResponse, ImageInferenceResponse, ModelInfo, ModelListResponse, RuntimeSettings } from "@/types/api";

export function renderWithProviders(ui: ReactElement, { route = "/" }: { route?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppProviders client={client}>{ui}</AppProviders>
    </MemoryRouter>,
  );
}

export const health: HealthResponse = {
  status: "ok",
  app: "YOLO Vision Studio",
  version: "1.0.0",
  uptime_s: 10,
  python_version: "3.12.0",
  torch_version: "2.4.0",
  ultralytics_version: "8.3.0",
  opencv_version: "4.10.0",
  cuda_available: false,
  mps_available: false,
  devices: [{ id: "cpu", name: "CPU", type: "cpu" }],
  default_device: "cpu",
  video_encoder: "ffmpeg (H.264)",
  model_security_scan: true,
  active_model: null,
  limits: { max_model_size_mb: 512, max_image_size_mb: 25, max_video_size_mb: 1024 },
  issues: [],
};

export const model: ModelInfo = {
  id: "0123456789abcdef",
  name: "best.pt",
  file_size_bytes: 6_000_000,
  sha256: "a".repeat(64),
  uploaded_at: "2026-01-01T00:00:00Z",
  status: "loaded",
  is_active: true,
  task: "detect",
  architecture: "yolo11n",
  num_classes: 3,
  class_names: ["person", "car", "dog"],
  parameters: 2_600_000,
  trained_image_size: 640,
  ultralytics_version: "8.3.0",
  trained_at: null,
  device: "cpu",
  last_loaded_at: "2026-01-01T00:00:00Z",
  load_time_ms: 120,
  error: null,
  active_jobs: 0,
};

export const runtimeSettings: RuntimeSettings = {
  default_confidence: 0.25,
  default_iou: 0.45,
  default_image_size: 640,
  default_max_detections: 300,
  preferred_device: "auto",
  max_video_fps: 30,
  save_image_results: true,
  output_retention_hours: 72,
  upload_retention_hours: 24,
  cleanup_interval_minutes: 30,
  history_max_entries: 1000,
};

export const inferenceResult: ImageInferenceResponse = {
  id: "fedcba9876543210",
  created_at: "2026-01-01T00:00:00Z",
  model: { id: model.id, name: "best.pt", task: "detect" },
  image: { filename: "street.jpg", width: 640, height: 480 },
  params: { confidence: 0.25, iou: 0.45, image_size: 640, max_detections: 300, device: "auto", classes: null },
  device: "cpu",
  count: 3,
  class_counts: { person: 2, car: 1 },
  detections: [
    { class_id: 0, class_name: "person", confidence: 0.91, bbox: { x1: 10, y1: 20, x2: 110, y2: 220, x: 10, y: 20, width: 100, height: 200 } },
    { class_id: 1, class_name: "car", confidence: 0.55, bbox: { x1: 300, y1: 200, x2: 500, y2: 320, x: 300, y: 200, width: 200, height: 120 } },
    { class_id: 0, class_name: "person", confidence: 0.73, bbox: { x1: 150, y1: 40, x2: 210, y2: 200, x: 150, y: 40, width: 60, height: 160 } },
  ],
  timings: { preprocess_ms: 1.2, inference_ms: 42.5, postprocess_ms: 0.8, total_ms: 51.3 },
  saved: true,
  annotated_url: "/api/results/fedcba9876543210/annotated",
  original_url: "/api/results/fedcba9876543210/original",
  thumbnail_url: "/api/results/fedcba9876543210/thumbnail",
  annotated_data_url: null,
};

/** Backend with one loaded model. Individual tests override what they need. */
export function mockBackend({ withModel = true }: { withModel?: boolean } = {}) {
  const models: ModelListResponse = withModel ? { models: [model], active_model_id: model.id } : { models: [], active_model_id: null };
  vi.spyOn(api, "health").mockResolvedValue({ ...health, active_model: withModel ? { id: model.id, name: model.name, task: "detect", num_classes: 3, device: "cpu" } : null });
  vi.spyOn(api, "listModels").mockResolvedValue(models);
  vi.spyOn(api, "settings").mockResolvedValue(runtimeSettings);
  vi.spyOn(api, "stats").mockResolvedValue({
    total_detections: 0,
    images_processed: 0,
    videos_processed: 0,
    live_sessions: 0,
    avg_inference_ms: null,
    daily: [],
    top_classes: [],
  });
  vi.spyOn(api, "history").mockResolvedValue({ items: [], total: 0, limit: 6, offset: 0 });
}
