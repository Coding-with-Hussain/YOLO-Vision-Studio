import { Boxes, ServerOff } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useActiveModel, useHealth } from "@/hooks/queries";

/**
 * Banner explaining why inference is unavailable (backend offline or no model
 * loaded). Renders nothing when everything is ready.
 */
export function ModelRequired() {
  const { connection } = useHealth();
  const { active, ready, isLoading } = useActiveModel();
  if (connection === "disconnected") {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center">
        <ServerOff className="size-5 shrink-0 text-destructive" aria-hidden />
        <div className="flex-1 text-sm">
          <p className="font-medium">The backend is not reachable</p>
          <p className="text-muted-foreground">Start the FastAPI server or check the API URL in Settings.</p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link to="/settings">Open settings</Link>
        </Button>
      </div>
    );
  }
  if (isLoading || ready || connection === "connecting") return null;
  return (
    <div role="status" className="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-4 sm:flex-row sm:items-center">
      <Boxes className="size-5 shrink-0 text-warning" aria-hidden />
      <div className="flex-1 text-sm">
        <p className="font-medium">{active ? `${active.name} is not loaded` : "No model loaded"}</p>
        <p className="text-muted-foreground">
          {active ? "Load it in the Model Manager to run detection." : "Upload your YOLO .pt weights to start detecting objects."}
        </p>
      </div>
      <Button asChild size="sm">
        <Link to="/models">Open Model Manager</Link>
      </Button>
    </div>
  );
}
