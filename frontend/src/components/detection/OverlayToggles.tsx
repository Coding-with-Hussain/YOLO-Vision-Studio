import { Eye, Percent, Square, Tag } from "lucide-react";

import { cn } from "@/lib/utils";
import { usePreferences, type DisplayPreferences } from "@/stores/preferences";

const TOGGLES: { key: keyof DisplayPreferences; label: string; icon: typeof Eye }[] = [
  { key: "showBoxes", label: "Boxes", icon: Square },
  { key: "showLabels", label: "Labels", icon: Tag },
  { key: "showConfidence", label: "Scores", icon: Percent },
];

/** Show/hide boxes, labels and confidence scores (persisted per browser). */
export function OverlayToggles({ className }: { className?: string }) {
  const display = usePreferences((s) => s.display);
  const setDisplay = usePreferences((s) => s.setDisplay);
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-lg border bg-background/60 p-1", className)} role="group" aria-label="Overlay options">
      {TOGGLES.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          aria-pressed={display[key]}
          onClick={() => setDisplay({ [key]: !display[key] })}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
            display[key] ? "bg-elevated text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
