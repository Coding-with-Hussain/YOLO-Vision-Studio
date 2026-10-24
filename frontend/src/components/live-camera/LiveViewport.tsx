import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import type { DisplayPreferences } from "@/stores/preferences";
import { drawDetections } from "@/utils/drawDetections";
import type { LiveResult } from "./useLiveDetection";

export type DisplayMode = "synced" | "live";

export interface LiveViewportHandle {
  canvas: HTMLCanvasElement | null;
}

/**
 * Renders the camera onto a canvas. In "synced" mode the exact frame that was
 * analysed is shown with its own detections (boxes always match the image).
 * In "live" mode the live video is shown with the most recent detections,
 * which is smoother but can lag behind fast motion by one inference.
 */
export const LiveViewport = forwardRef<
  LiveViewportHandle,
  {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    result: LiveResult | null;
    detecting: boolean;
    mode: DisplayMode;
    mirrored: boolean;
    display: DisplayPreferences;
    hiddenClasses: ReadonlySet<number>;
    active: boolean;
  }
>(function LiveViewport({ videoRef, result, detecting, mode, mirrored, display, hiddenClasses, active }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({ result, detecting, mode, mirrored, display, hiddenClasses });
  state.current = { result, detecting, mode, mirrored, display, hiddenClasses };
  useImperativeHandle(ref, () => ({ get canvas() { return canvasRef.current; } }), []);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      const { result: r, detecting: on, mode: m, mirrored: mir, display: d, hiddenClasses: hidden } = state.current;
      const useFrame = on && m === "synced" && r?.bitmap;
      const source: CanvasImageSource | null = useFrame ? r!.bitmap : video.readyState >= 2 ? video : null;
      if (!source) return;
      const sw = useFrame ? r!.bitmap!.width : video.videoWidth;
      const sh = useFrame ? r!.bitmap!.height : video.videoHeight;
      if (!sw || !sh) return;
      // Fixed drawing buffer at the video's resolution; CSS scales it.
      const width = video.videoWidth || sw;
      const height = video.videoHeight || sh;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.save();
      if (mir) {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(source, 0, 0, width, height);
      ctx.restore();
      if (on && r && r.detections.length) {
        drawDetections(ctx, r.detections, { display: d, hiddenClasses: hidden, mirrored: mir, sourceWidth: r.width, sourceHeight: r.height });
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, videoRef]);

  return <canvas ref={canvasRef} className="absolute inset-0 size-full object-contain" aria-label="Camera preview with detections" role="img" />;
});
