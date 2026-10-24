import { ArrowRight, Boxes } from "lucide-react";
import { Link } from "react-router-dom";

import { ModelStatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveModel, useHealth } from "@/hooks/queries";
import { formatBytes, formatDateTime, titleCase } from "@/utils/format";

export function ModelStatusCard() {
  const { active, isLoading } = useActiveModel();
  const { connection } = useHealth();
  const rows: [string, string | null][] = active
    ? [
        ["Task", active.task ? titleCase(active.task) : null],
        ["Architecture", active.architecture],
        ["Classes", active.num_classes != null ? String(active.num_classes) : null],
        ["Device", active.device ? active.device.toUpperCase() : null],
        ["File size", formatBytes(active.file_size_bytes)],
        ["Last loaded", active.last_loaded_at ? formatDateTime(active.last_loaded_at) : null],
      ]
    : [];

  return (
    <Card className="flex flex-col lg:self-start">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Model status</CardTitle>
        {active ? <ModelStatusBadge status={active.status} /> : !isLoading && <ModelStatusBadge status="not_loaded" />}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12" />
            <Skeleton className="h-24" />
          </div>
        ) : active ? (
          <>
            <div className="flex items-center gap-3 rounded-xl border bg-background/40 p-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Boxes className="size-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold" title={active.name}>
                  {active.name}
                </p>
                <p className="text-xs text-muted-foreground">Active model</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className={value ? "font-medium [overflow-wrap:anywhere]" : "text-muted-foreground"}>{value ?? "Unavailable"}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-start justify-center gap-3">
            <p className="text-sm text-muted-foreground">
              {connection === "disconnected"
                ? "The backend is offline, so model information is unavailable."
                : "No model is loaded. Upload your trained weights (for example best.pt) to begin."}
            </p>
          </div>
        )}
        <Button asChild variant="secondary" className="w-full">
          <Link to="/models">
            {active ? "Manage models" : "Upload a model"} <ArrowRight />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
