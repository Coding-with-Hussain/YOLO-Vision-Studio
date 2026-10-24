import { motion } from "framer-motion";
import { Columns2, Download, Eye, EyeOff, ImageIcon, ScanSearch, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { ImageWithOverlay } from "@/components/detection/ImageWithOverlay";
import { OverlayToggles } from "@/components/detection/OverlayToggles";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { downloadUrl } from "@/services/api";
import { usePreferences } from "@/stores/preferences";
import type { ImageInferenceResponse } from "@/types/api";
import { classColor } from "@/utils/colors";

type View = "original" | "annotated" | "compare";

export function ResultsViewer({
  imageUrl,
  result,
  running,
  highlighted,
  onHover,
}: {
  imageUrl: string | null;
  result: ImageInferenceResponse | null;
  running: boolean;
  highlighted: number | null;
  onHover: (index: number | null) => void;
}) {
  const [view, setView] = useState<View>("annotated");
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const display = usePreferences((s) => s.display);

  const classes = useMemo(() => {
    const map = new Map<number, { name: string; count: number }>();
    for (const d of result?.detections ?? []) {
      const entry = map.get(d.class_id) ?? { name: d.class_name, count: 0 };
      entry.count += 1;
      map.set(d.class_id, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [result]);

  if (!imageUrl) {
    return (
      <EmptyState
        icon={ScanSearch}
        title="Results appear here"
        description="Choose an image, adjust the detection settings and run the model to see annotated detections."
        className="min-h-[22rem]"
      />
    );
  }

  const width = result?.image.width ?? 0;
  const height = result?.image.height ?? 0;
  const overlay = result
    ? { detections: result.detections, display, hiddenClasses: hidden, highlighted, onHover }
    : undefined;
  const annotatedDownload = result?.saved ? downloadUrl(result.annotated_url) : result?.annotated_data_url;

  const toggleClass = (id: number) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList aria-label="Result view">
            <TabsTrigger value="original">
              <ImageIcon aria-hidden /> Original
            </TabsTrigger>
            <TabsTrigger value="annotated" disabled={!result}>
              <Sparkles aria-hidden /> Annotated
            </TabsTrigger>
            <TabsTrigger value="compare" disabled={!result}>
              <Columns2 aria-hidden /> Compare
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          {result && view !== "original" && <OverlayToggles />}
          {result && annotatedDownload && (
            <Button asChild variant="secondary" size="sm">
              <a href={annotatedDownload} download={`${result.image.filename.replace(/\.[^.]+$/, "")}-annotated.jpg`}>
                <Download /> Download
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="relative">
        {!result && (
          <div className="checkerboard overflow-hidden rounded-xl">
            <img src={imageUrl} alt="Selected image" className="mx-auto max-h-[62vh] w-auto object-contain" />
          </div>
        )}
        {result && view === "original" && (
          <ImageWithOverlay src={imageUrl} alt="Original image" width={width} height={height} maxHeight="62vh" />
        )}
        {result && view === "annotated" && (
          <ImageWithOverlay src={imageUrl} alt="Image with detections" width={width} height={height} maxHeight="62vh" overlay={overlay} />
        )}
        {result && view === "compare" && (
          <div className="grid gap-3 md:grid-cols-2">
            <figure className="space-y-2">
              <ImageWithOverlay src={imageUrl} alt="Original image" width={width} height={height} maxHeight="48vh" />
              <figcaption className="text-center text-xs text-muted-foreground">Original</figcaption>
            </figure>
            <figure className="space-y-2">
              <ImageWithOverlay src={imageUrl} alt="Image with detections" width={width} height={height} maxHeight="48vh" overlay={overlay} />
              <figcaption className="text-center text-xs text-muted-foreground">Annotated · {result.count} objects</figcaption>
            </figure>
          </div>
        )}
        {running && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-xl bg-background/50 backdrop-blur-[2px]"
            role="status"
            aria-label="Running detection"
          >
            <div className="absolute inset-x-0 h-24 animate-scan bg-gradient-to-b from-transparent via-primary/25 to-transparent" />
            <div className="relative flex items-center gap-2 rounded-full border bg-card/90 px-4 py-2 text-sm font-medium shadow-lg">
              <ScanSearch className="size-4 animate-pulse text-primary" aria-hidden /> Running YOLO inference…
            </div>
          </motion.div>
        )}
      </div>

      {result && classes.length > 0 && view !== "original" && (
        <div className="flex flex-wrap gap-1.5" aria-label="Toggle class visibility">
          {classes.map(([id, { name, count }]) => {
            const isHidden = hidden.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleClass(id)}
                aria-pressed={!isHidden}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors hover:border-input",
                  isHidden ? "text-muted-foreground line-through opacity-60" : "bg-background/50",
                )}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: classColor(id) }} aria-hidden />
                {name}
                <span className="tabular text-muted-foreground">{count}</span>
                {isHidden ? <EyeOff className="size-3" aria-hidden /> : <Eye className="size-3 opacity-50" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
