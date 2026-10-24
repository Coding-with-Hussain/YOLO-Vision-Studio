import { usePreferences } from "@/stores/preferences";
import type {
  CleanupResult,
  HealthResponse,
  HistoryDetail,
  HistoryListResponse,
  HistoryQuery,
  ImageInferenceResponse,
  InferenceParams,
  JobResponse,
  ModelInfo,
  ModelListResponse,
  RuntimeSettings,
  StatsResponse,
  StorageStatus,
  VideoJobSettings,
} from "@/types/api";
import { ApiError, toApiError } from "./errors";
import { uploadWithProgress, type UploadHandle } from "./upload";

export { ApiError, describeError } from "./errors";

const ENV_BASE_URL: string | undefined = import.meta.env.VITE_API_BASE_URL;

/** API base URL: Settings override, then VITE_API_BASE_URL, then a dev default. */
export function getApiBaseUrl(): string {
  const override = usePreferences.getState().apiBaseUrl;
  const base = override ?? ENV_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:8000" : "");
  return base.replace(/\/+$/, "");
}

export function defaultApiBaseUrl(): string {
  return (ENV_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:8000" : "")).replace(/\/+$/, "");
}

/** Absolute URL for a backend path such as "/api/results/abc/annotated". */
export function apiUrl(path: string): string {
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function wsUrl(path: string): string {
  const base = getApiBaseUrl() || window.location.origin;
  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: BodyInit | object | null;
  timeoutMs?: number;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, timeoutMs = 30_000, headers, signal, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs);
  signal?.addEventListener("abort", () => controller.abort(signal.reason));

  const isJson = body != null && !(body instanceof FormData) && typeof body === "object" && !(body instanceof Blob);
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...rest,
      headers: { Accept: "application/json", ...(isJson ? { "Content-Type": "application/json" } : {}), ...headers },
      body: isJson ? JSON.stringify(body) : (body as BodyInit | null | undefined),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    const timedOut = controller.signal.reason instanceof DOMException && controller.signal.reason.name === "TimeoutError";
    throw new ApiError(
      0,
      timedOut ? "TIMEOUT" : "NETWORK_ERROR",
      timedOut
        ? "The backend did not respond in time."
        : `Cannot reach the backend at ${getApiBaseUrl() || window.location.origin}. Is it running?`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    throw toApiError(response.status, data, `Request failed with status ${response.status}.`);
  }
  return data as T;
}

function settingsForm(file: File, settings: Partial<InferenceParams> | Partial<VideoJobSettings>, extra?: Record<string, string>) {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("settings", JSON.stringify(settings));
  for (const [key, value] of Object.entries(extra ?? {})) form.append(key, value);
  return form;
}

export const api = {
  health: (signal?: AbortSignal) => request<HealthResponse>("/api/health", { signal, timeoutMs: 8_000 }),

  // Models
  listModels: () => request<ModelListResponse>("/api/models"),
  getModel: (id: string) => request<ModelInfo>(`/api/models/${id}`),
  uploadModel: (file: File, onProgress: (fraction: number) => void): UploadHandle<ModelInfo> => {
    const form = new FormData();
    form.append("file", file, file.name);
    return uploadWithProgress<ModelInfo>(apiUrl("/api/models/upload"), form, onProgress);
  },
  loadModel: (id: string, options: { device?: string; force_reload?: boolean } = {}) =>
    request<ModelInfo>(`/api/models/${id}/load`, { method: "POST", body: options, timeoutMs: 180_000 }),
  unloadModel: (id: string) => request<ModelInfo>(`/api/models/${id}/unload`, { method: "POST" }),
  deleteModel: (id: string) => request<void>(`/api/models/${id}`, { method: "DELETE" }),

  // Inference
  inferImage: (file: File, settings: Partial<InferenceParams>, signal?: AbortSignal) =>
    request<ImageInferenceResponse>("/api/inference/image", {
      method: "POST",
      body: settingsForm(file, settings),
      signal,
      timeoutMs: 180_000,
    }),
  startVideoJob: (file: File, settings: Partial<VideoJobSettings>, onProgress: (fraction: number) => void) =>
    uploadWithProgress<JobResponse>(apiUrl("/api/inference/video"), settingsForm(file, settings), onProgress),

  // Jobs
  activeJobs: () => request<JobResponse[]>("/api/jobs"),
  getJob: (id: string) => request<JobResponse>(`/api/jobs/${id}`),
  cancelJob: (id: string) => request<JobResponse>(`/api/jobs/${id}/cancel`, { method: "POST" }),

  // History
  history: (query: HistoryQuery = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
    }
    const qs = params.toString();
    return request<HistoryListResponse>(`/api/history${qs ? `?${qs}` : ""}`);
  },
  historyEntry: (id: string) => request<HistoryDetail>(`/api/history/${id}`),
  deleteHistoryEntry: (id: string) => request<void>(`/api/history/${id}`, { method: "DELETE" }),
  clearHistory: () => request<{ deleted: number }>("/api/history", { method: "DELETE" }),
  stats: () => request<StatsResponse>("/api/stats"),

  // Settings & storage
  settings: () => request<RuntimeSettings>("/api/settings"),
  updateSettings: (update: Partial<RuntimeSettings>) =>
    request<RuntimeSettings>("/api/settings", { method: "PUT", body: update }),
  resetSettings: () => request<RuntimeSettings>("/api/settings/reset", { method: "POST" }),
  storage: () => request<StorageStatus>("/api/storage"),
  cleanup: () => request<CleanupResult>("/api/storage/cleanup", { method: "POST", timeoutMs: 120_000 }),
};

export function downloadUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${apiUrl(path)}${path.includes("?") ? "&" : "?"}download=true`;
}
