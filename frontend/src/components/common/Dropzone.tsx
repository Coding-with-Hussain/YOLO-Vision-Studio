import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/utils/format";

export interface DropzoneProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  /** Lower-case extensions without dots, e.g. ["jpg", "png"]. */
  extensions: string[];
  accept: string;
  maxBytes?: number;
  disabled?: boolean;
  onFile: (file: File) => void;
  onReject: (message: string) => void;
  className?: string;
  children?: ReactNode;
  compact?: boolean;
  label?: string;
}

export function validateFile(file: File, extensions: string[], maxBytes?: number): string | null {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!extensions.includes(ext)) {
    return `"${file.name}" is not supported. Accepted: ${extensions.map((e) => `.${e}`).join(", ")}.`;
  }
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (maxBytes && file.size > maxBytes) {
    return `"${file.name}" is ${formatBytes(file.size)}, larger than the ${formatBytes(maxBytes, 0)} limit.`;
  }
  return null;
}

export function Dropzone({
  icon: Icon,
  title,
  subtitle,
  extensions,
  accept,
  maxBytes,
  disabled,
  onFile,
  onReject,
  className,
  children,
  compact,
  label = "Browse files",
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const inputId = useId();
  const reduceMotion = useReducedMotion();

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      if (files.length > 1) {
        onReject("Please choose a single file.");
        return;
      }
      const file = files[0];
      const problem = validateFile(file, extensions, maxBytes);
      if (problem) onReject(problem);
      else onFile(file);
    },
    [extensions, maxBytes, onFile, onReject],
  );

  return (
    <motion.div
      animate={reduceMotion ? undefined : { scale: dragging ? 1.01 : 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      onDragEnter={(e) => {
        e.preventDefault();
        if (disabled) return;
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
      data-dragging={dragging || undefined}
      data-testid="dropzone"
      className={cn(
        "group relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed text-center transition-colors",
        compact ? "gap-2 px-4 py-6" : "gap-4 px-6 py-10 sm:py-14",
        dragging ? "border-primary bg-primary/[0.07]" : "border-input bg-background/40 hover:border-primary/50",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    >
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" aria-hidden />
      <div className="relative">
        <div
          className={cn(
            "absolute inset-0 rounded-2xl bg-primary/30 blur-xl transition-opacity",
            dragging ? "opacity-100" : "opacity-0 group-hover:opacity-60",
          )}
          aria-hidden
        />
        <div
          className={cn(
            "relative flex items-center justify-center rounded-2xl border bg-card text-primary transition-transform",
            compact ? "size-11" : "size-14",
            dragging && "-translate-y-0.5",
          )}
        >
          <Icon className={compact ? "size-5" : "size-6"} aria-hidden />
        </div>
      </div>
      <div className="relative space-y-1">
        <p className={cn("font-semibold", compact ? "text-sm" : "text-base sm:text-lg")}>
          {dragging ? "Release to upload" : title}
        </p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="relative flex flex-col items-center gap-2">
        <Button type="button" variant="secondary" size={compact ? "sm" : "default"} onClick={() => inputRef.current?.click()} disabled={disabled}>
          {label}
        </Button>
        <p className="text-xs text-muted-foreground">
          {extensions.map((e) => `.${e}`).join(", ")}
          {maxBytes ? ` · up to ${formatBytes(maxBytes, 0)}` : ""}
        </p>
      </div>
      {children}
      <input
        id={inputId}
        aria-label={title}
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </motion.div>
  );
}
