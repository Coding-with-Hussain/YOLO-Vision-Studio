import type { DisplayPreferences } from "@/stores/preferences";
import type { Detection } from "@/types/api";
import { classColor, contrastText } from "./colors";

export interface DrawOptions {
  display: DisplayPreferences;
  hiddenClasses?: ReadonlySet<number>;
  /** Mirror the geometry horizontally (selfie view); text is never mirrored. */
  mirrored?: boolean;
  /** Source frame size the detection coordinates refer to. */
  sourceWidth: number;
  sourceHeight: number;
}

/**
 * Draw detections onto a canvas whose drawing buffer has the same aspect ratio
 * as the source frame. Coordinates are scaled from source pixels to canvas
 * pixels, so boxes stay aligned at any resolution.
 */
export function drawDetections(ctx: CanvasRenderingContext2D, detections: Detection[], options: DrawOptions) {
  const { width, height } = ctx.canvas;
  const sx = width / options.sourceWidth;
  const sy = height / options.sourceHeight;
  const lineWidth = Math.max(2, Math.round(Math.min(width, height) / 320));
  const fontSize = Math.max(12, Math.round(Math.min(width, height) / 42));
  ctx.save();
  ctx.lineJoin = "round";
  ctx.font = `600 ${fontSize}px "Inter Variable", Inter, system-ui, sans-serif`;
  ctx.textBaseline = "top";

  for (const det of detections) {
    if (options.hiddenClasses?.has(det.class_id)) continue;
    const color = classColor(det.class_id);
    const x1 = options.mirrored ? width - det.bbox.x2 * sx : det.bbox.x1 * sx;
    const y1 = det.bbox.y1 * sy;
    const w = (det.bbox.x2 - det.bbox.x1) * sx;
    const h = (det.bbox.y2 - det.bbox.y1) * sy;

    if (options.display.showBoxes) {
      if (det.polygon && det.polygon.length > 2) {
        ctx.beginPath();
        det.polygon.forEach(([px, py], i) => {
          const x = options.mirrored ? width - px * sx : px * sx;
          if (i === 0) ctx.moveTo(x, py * sy);
          else ctx.lineTo(x, py * sy);
        });
        ctx.closePath();
        ctx.fillStyle = `${color}2e`;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(x1, y1, w, h);
      if (det.keypoints) {
        ctx.fillStyle = color;
        for (const kp of det.keypoints) {
          if (kp.confidence != null && kp.confidence < 0.5) continue;
          const x = options.mirrored ? width - kp.x * sx : kp.x * sx;
          ctx.beginPath();
          ctx.arc(x, kp.y * sy, lineWidth + 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    const parts = [
      options.display.showLabels ? det.class_name : null,
      options.display.showConfidence ? `${Math.round(det.confidence * 100)}%` : null,
    ].filter(Boolean);
    if (parts.length) {
      const text = parts.join(" ");
      const padX = Math.round(fontSize * 0.4);
      const padY = Math.round(fontSize * 0.2);
      const textWidth = ctx.measureText(text).width;
      const boxH = fontSize + padY * 2;
      let ly = y1 - boxH;
      if (ly < 0) ly = y1;
      const lx = Math.min(Math.max(0, x1), width - textWidth - padX * 2);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect?.(lx, ly, textWidth + padX * 2, boxH, 4);
      if (!ctx.roundRect) ctx.rect(lx, ly, textWidth + padX * 2, boxH);
      ctx.fill();
      ctx.fillStyle = contrastText(color);
      ctx.fillText(text, lx + padX, ly + padY + 1);
    }
  }
  ctx.restore();
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))), type, quality),
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function timestampedName(prefix: string, ext: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${prefix}-${stamp}.${ext}`;
}
