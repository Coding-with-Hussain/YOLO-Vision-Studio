import { motion } from "framer-motion";
import { Boxes, MoreHorizontal, Play, Power, RefreshCw, Trash2, Zap } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { ModelStatusBadge } from "@/components/common/StatusBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteModel, useLoadModel, useUnloadModel } from "@/hooks/queries";
import { cn } from "@/lib/utils";
import type { ModelInfo } from "@/types/api";
import { formatBytes, formatRelative, titleCase } from "@/utils/format";

export function ModelList({
  models,
  loading,
  selectedId,
  onSelect,
}: {
  models: ModelInfo[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const loadModel = useLoadModel();
  const unloadModel = useUnloadModel();
  const deleteModel = useDeleteModel();
  const [pendingDelete, setPendingDelete] = useState<ModelInfo | null>(null);

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-[88px] rounded-2xl" />
        ))}
      </div>
    );
  }
  if (models.length === 0) {
    return (
      <EmptyState
        icon={Boxes}
        title="No models yet"
        description="Upload a trained Ultralytics YOLO checkpoint such as best.pt to get started."
        compact
      />
    );
  }

  return (
    <>
      <ul className="space-y-3" aria-label="Uploaded models">
        {models.map((model, i) => {
          const isLoading = model.status === "loading" || (loadModel.isPending && loadModel.variables?.id === model.id);
          const status = isLoading ? "loading" : model.status;
          return (
            <motion.li
              key={model.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(model.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(model.id);
                  }
                }}
                aria-pressed={selectedId === model.id}
                className={cn(
                  "group flex cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3.5 transition-all hover:border-input sm:gap-4 sm:p-4",
                  selectedId === model.id && "border-primary/40 shadow-[0_0_0_1px_rgb(var(--primary)/0.25)]",
                )}
              >
                <div
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-xl border",
                    model.is_active && model.status === "loaded" ? "border-primary/30 bg-primary/10 text-primary" : "bg-elevated text-muted-foreground",
                  )}
                >
                  <Boxes className="size-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium" title={model.name}>
                      {model.name}
                    </p>
                    {model.is_active && (
                      <Badge variant="default" className="px-2">
                        <Zap aria-hidden /> Active
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[model.task ? titleCase(model.task) : null, model.num_classes != null ? `${model.num_classes} classes` : null, formatBytes(model.file_size_bytes), `uploaded ${formatRelative(model.uploaded_at)}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="hidden sm:block">
                  <ModelStatusBadge status={status} />
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  {!(model.is_active && model.status === "loaded") && (
                    <Button size="sm" variant="secondary" onClick={() => loadModel.mutate({ id: model.id })} loading={isLoading} aria-label={`Load ${model.name}`}>
                      {!isLoading && <Play />}
                      <span className="hidden sm:inline">{model.status === "loaded" ? "Activate" : "Load"}</span>
                    </Button>
                  )}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button size="icon-sm" variant="ghost" aria-label={`More actions for ${model.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-48 p-1">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-accent disabled:opacity-50"
                        onClick={() => loadModel.mutate({ id: model.id, force_reload: true })}
                        disabled={isLoading}
                      >
                        <RefreshCw className="size-4" /> Reload from disk
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-accent disabled:opacity-50"
                        onClick={() => unloadModel.mutate(model.id)}
                        disabled={model.status !== "loaded"}
                      >
                        <Power className="size-4" /> Unload from memory
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-destructive hover:bg-destructive/10"
                        onClick={() => setPendingDelete(model)}
                      >
                        <Trash2 className="size-4" /> Remove model
                      </button>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>

      <AlertDialog open={pendingDelete != null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The weights file is deleted from the backend and the model is unloaded from memory. Detection history that used
              this model is kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              destructive
              onClick={() => pendingDelete && deleteModel.mutate({ id: pendingDelete.id, name: pendingDelete.name })}
            >
              <Trash2 className="size-4" /> Remove model
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
