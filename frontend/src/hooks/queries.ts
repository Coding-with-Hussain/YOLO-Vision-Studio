import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, describeError } from "@/services/api";
import { usePreferences } from "@/stores/preferences";
import type { HistoryQuery, JobResponse, RuntimeSettings } from "@/types/api";

export const queryKeys = {
  health: (base: string | null) => ["health", base] as const,
  models: ["models"] as const,
  stats: ["stats"] as const,
  history: (query: HistoryQuery) => ["history", query] as const,
  historyEntry: (id: string) => ["history-entry", id] as const,
  settings: ["settings"] as const,
  storage: ["storage"] as const,
  job: (id: string) => ["job", id] as const,
  activeJobs: ["jobs", "active"] as const,
};

export type ConnectionState = "connecting" | "connected" | "degraded" | "disconnected";

export function useHealth() {
  const base = usePreferences((s) => s.apiBaseUrl);
  const query = useQuery({
    queryKey: queryKeys.health(base),
    queryFn: ({ signal }) => api.health(signal),
    refetchInterval: (q) => (q.state.status === "error" ? 5_000 : 15_000),
    retry: false,
    refetchOnWindowFocus: true,
  });
  let connection: ConnectionState = "connecting";
  if (query.isError) connection = "disconnected";
  else if (query.data) connection = query.data.status === "ok" ? "connected" : "degraded";
  return { ...query, connection };
}

export function useModels() {
  return useQuery({ queryKey: queryKeys.models, queryFn: api.listModels, staleTime: 5_000 });
}

/** The active model when it is loaded and ready for inference. */
export function useActiveModel() {
  const models = useModels();
  const active = models.data?.models.find((m) => m.id === models.data?.active_model_id) ?? null;
  return { ...models, active, ready: active?.status === "loaded" };
}

function useInvalidateModels() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: queryKeys.models });
    client.invalidateQueries({ queryKey: ["health"] });
  };
}

export function useLoadModel() {
  const invalidate = useInvalidateModels();
  return useMutation({
    mutationFn: (vars: { id: string; device?: string; force_reload?: boolean }) =>
      api.loadModel(vars.id, { device: vars.device, force_reload: vars.force_reload }),
    onSuccess: (model, vars) => {
      toast.success(vars.force_reload ? `Reloaded ${model.name}` : `${model.name} is now active`, {
        description: `Running on ${model.device ?? "unknown device"}${model.load_time_ms ? ` · loaded in ${Math.round(model.load_time_ms)} ms` : ""}`,
      });
    },
    onError: (error) => toast.error("Could not load model", { description: describeError(error) }),
    onSettled: invalidate,
  });
}

export function useUnloadModel() {
  const invalidate = useInvalidateModels();
  return useMutation({
    mutationFn: (id: string) => api.unloadModel(id),
    onSuccess: (model) => toast.success(`Unloaded ${model.name}`),
    onError: (error) => toast.error("Could not unload model", { description: describeError(error) }),
    onSettled: invalidate,
  });
}

export function useDeleteModel() {
  const invalidate = useInvalidateModels();
  return useMutation({
    mutationFn: (vars: { id: string; name: string }) => api.deleteModel(vars.id),
    onSuccess: (_data, vars) => toast.success(`Removed ${vars.name}`),
    onError: (error) => toast.error("Could not remove model", { description: describeError(error) }),
    onSettled: invalidate,
  });
}

export function useStats() {
  return useQuery({ queryKey: queryKeys.stats, queryFn: api.stats, staleTime: 10_000 });
}

export function useHistory(query: HistoryQuery) {
  return useQuery({
    queryKey: queryKeys.history(query),
    queryFn: () => api.history(query),
    placeholderData: keepPreviousData,
  });
}

export function useHistoryEntry(id: string | null) {
  return useQuery({
    queryKey: queryKeys.historyEntry(id ?? ""),
    queryFn: () => api.historyEntry(id as string),
    enabled: Boolean(id),
  });
}

export function useInvalidateActivity() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: ["history"] });
    client.invalidateQueries({ queryKey: queryKeys.stats });
    client.invalidateQueries({ queryKey: queryKeys.storage });
  };
}

export function useRuntimeSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: api.settings, staleTime: 30_000 });
}

export function useUpdateRuntimeSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (update: Partial<RuntimeSettings>) => api.updateSettings(update),
    onSuccess: (settings) => client.setQueryData(queryKeys.settings, settings),
  });
}

export function useStorage() {
  return useQuery({ queryKey: queryKeys.storage, queryFn: api.storage });
}

const FINISHED = new Set(["completed", "failed", "cancelled"]);

export function isJobFinished(job: Pick<JobResponse, "status"> | undefined | null) {
  return Boolean(job && FINISHED.has(job.status));
}

/** Poll a video job once per second until it finishes. */
export function useJob(id: string | null) {
  return useQuery({
    queryKey: queryKeys.job(id ?? ""),
    queryFn: () => api.getJob(id as string),
    enabled: Boolean(id),
    refetchInterval: (q) => (isJobFinished(q.state.data) ? false : 1_000),
    retry: 2,
  });
}
