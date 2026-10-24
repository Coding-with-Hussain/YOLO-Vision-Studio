// Types mirroring the FastAPI response schemas (backend/app/schemas).

export type DevicePreference = "auto" | "cpu" | "cuda" | "mps";

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

export interface DeviceInfo {
  id: string;
  name: string;
  type: "cpu" | "cuda" | "mps";
}

export interface ActiveModelSummary {
  id: string;
  name: string;
  task: string | null;
  num_classes: number | null;
  device: string | null;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  app: string;
  version: string;
  uptime_s: number;
  python_version: string;
  torch_version: string | null;
  ultralytics_version: string | null;
  opencv_version: string | null;
  cuda_available: boolean;
  mps_available: boolean;
  devices: DeviceInfo[];
  default_device: string;
  video_encoder: string;
  model_security_scan: boolean;
  active_model: ActiveModelSummary | null;
  limits: { max_model_size_mb: number; max_image_size_mb: number; max_video_size_mb: number };
  issues: string[];
}

export type ModelStatus = "not_loaded" | "loading" | "loaded" | "error";

export interface ModelInfo {
  id: string;
  name: string;
  file_size_bytes: number;
  sha256: string;
  uploaded_at: string;
  status: ModelStatus;
  is_active: boolean;
  task: string | null;
  architecture: string | null;
  num_classes: number | null;
  class_names: string[];
  parameters: number | null;
  trained_image_size: number | null;
  ultralytics_version: string | null;
  trained_at: string | null;
  device: string | null;
  last_loaded_at: string | null;
  load_time_ms: number | null;
  error: string | null;
  active_jobs: number;
}

export interface ModelListResponse {
  models: ModelInfo[];
  active_model_id: string | null;
}

export interface InferenceParams {
  confidence: number;
  iou: number;
  image_size: number;
  max_detections: number;
  device: DevicePreference;
  classes: number[] | null;
}

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Keypoint {
  x: number;
  y: number;
  confidence?: number | null;
}

export interface Detection {
  class_id: number;
  class_name: string;
  confidence: number;
  bbox: BoundingBox;
  polygon?: number[][] | null;
  keypoints?: Keypoint[] | null;
}

export interface Timings {
  preprocess_ms: number | null;
  inference_ms: number | null;
  postprocess_ms: number | null;
  total_ms: number;
}

export interface ModelRef {
  id: string;
  name: string;
  task: string | null;
}

export interface ImageInferenceResponse {
  id: string;
  created_at: string;
  model: ModelRef;
  image: { filename: string; width: number; height: number };
  params: InferenceParams;
  device: string;
  count: number;
  class_counts: Record<string, number>;
  detections: Detection[];
  timings: Timings;
  saved: boolean;
  annotated_url: string | null;
  original_url: string | null;
  thumbnail_url: string | null;
  annotated_data_url: string | null;
}

export type FrameStrategy = "every_frame" | "interval" | "target_fps";
export type OutputQuality = "low" | "medium" | "high";

export interface VideoJobSettings extends InferenceParams {
  frame_strategy: FrameStrategy;
  frame_interval: number;
  target_fps: number;
  hold_detections: boolean;
  max_duration_s: number | null;
  output_quality: OutputQuality;
  output_max_height: number | null;
}

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type JobStage = "queued" | "loading" | "processing" | "encoding" | "finished";

export interface VideoInfo {
  filename: string;
  width: number;
  height: number;
  fps: number | null;
  frame_count: number | null;
  duration_s: number | null;
  file_size_bytes: number;
}

export interface JobProgress {
  frames_read: number;
  frames_analyzed: number;
  total_frames: number | null;
  percent: number | null;
  detections: number;
  processing_fps: number | null;
  elapsed_s: number;
  eta_s: number | null;
}

export interface TimelinePoint {
  t: number;
  frame: number;
  count: number;
}

export interface VideoResult {
  output_url: string | null;
  input_url: string | null;
  output_size_bytes: number | null;
  output_width: number;
  output_height: number;
  output_fps: number;
  encoder: string;
  total_detections: number;
  frames_written: number;
  frames_analyzed: number;
  avg_inference_ms: number | null;
  processing_time_s: number;
  class_counts: Record<string, number>;
  class_peaks: Record<string, number>;
  timeline: TimelinePoint[];
  files_expired: boolean;
  truncated: boolean;
}

export interface JobResponse {
  id: string;
  kind: "video";
  status: JobStatus;
  stage: JobStage;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  model: ModelRef;
  device: string | null;
  video: VideoInfo;
  settings: VideoJobSettings;
  progress: JobProgress;
  error: string | null;
  error_code: string | null;
  result: VideoResult | null;
}

export type HistoryKind = "image" | "video" | "live";

export interface HistoryArtifacts {
  annotated_url: string | null;
  original_url: string | null;
  thumbnail_url: string | null;
  output_url: string | null;
  input_url: string | null;
}

export interface HistoryItem {
  id: string;
  kind: HistoryKind;
  status: JobStatus;
  source_name: string;
  model_id: string | null;
  model_name: string | null;
  task: string | null;
  num_detections: number;
  duration_ms: number | null;
  avg_inference_ms: number | null;
  created_at: string;
  completed_at: string | null;
  error: string | null;
  files_expired: boolean;
  expires_at: string | null;
  artifacts: HistoryArtifacts;
  class_counts: Record<string, number>;
}

export interface HistoryDetail extends HistoryItem {
  params: Record<string, unknown>;
  summary: Record<string, unknown>;
}

export interface HistoryListResponse {
  items: HistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface HistoryQuery {
  q?: string;
  kind?: HistoryKind;
  status?: JobStatus;
  date_from?: string;
  date_to?: string;
  sort?: "created_at" | "duration" | "detections" | "name";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface StatsResponse {
  total_detections: number;
  images_processed: number;
  videos_processed: number;
  live_sessions: number;
  avg_inference_ms: number | null;
  daily: { date: string; jobs: number; detections: number }[];
  top_classes: { name: string; count: number }[];
}

export interface RuntimeSettings {
  default_confidence: number;
  default_iou: number;
  default_image_size: number;
  default_max_detections: number;
  preferred_device: DevicePreference;
  max_video_fps: number;
  save_image_results: boolean;
  output_retention_hours: number;
  upload_retention_hours: number;
  cleanup_interval_minutes: number;
  history_max_entries: number;
}

export interface StorageArea {
  name: "weights" | "uploads" | "outputs";
  exists: boolean;
  writable: boolean;
  file_count: number;
  size_bytes: number;
}

export interface StorageStatus {
  areas: StorageArea[];
  total_size_bytes: number;
  output_retention_hours: number;
  upload_retention_hours: number;
  cleanup_interval_minutes: number;
  last_cleanup_at: string | null;
}

export interface CleanupResult {
  removed_files: number;
  freed_bytes: number;
  expired_history_entries: number;
  trimmed_history_entries: number;
  ran_at: string;
}

// Live WebSocket messages
export type LiveServerMessage =
  | { type: "ready"; model: ModelRef | null; settings: InferenceParams; max_frame_bytes: number }
  | { type: "config_ack"; settings: InferenceParams }
  | {
      type: "result";
      frame_id: number;
      width: number;
      height: number;
      count: number;
      detections: Detection[];
      timings: Timings;
      server_ms: number;
      device: string;
      model: ModelRef;
      dropped: number;
    }
  | { type: "error"; code: string; message: string; frame_id: number | null }
  | { type: "pong" };
