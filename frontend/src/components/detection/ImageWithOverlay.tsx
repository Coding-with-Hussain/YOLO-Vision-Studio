import { cn } from "@/lib/utils";
import { DetectionOverlay, type OverlayProps } from "./DetectionOverlay";

/**
 * An image fitted into its container without distortion, with an overlay that
 * shares its exact box. ``maxHeight`` is any CSS length (e.g. "70vh").
 */
export function ImageWithOverlay({
  src,
  alt,
  width,
  height,
  maxHeight = "70vh",
  overlay,
  className,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  maxHeight?: string;
  overlay?: Omit<OverlayProps, "width" | "height">;
  className?: string;
}) {
  const ratio = width && height ? width / height : 16 / 9;
  return (
    <div
      className={cn("checkerboard relative mx-auto overflow-hidden rounded-xl", className)}
      style={{ aspectRatio: `${width || 16} / ${height || 9}`, width: `min(100%, calc(${maxHeight} * ${ratio}))` }}
    >
      <img src={src} alt={alt} className="absolute inset-0 size-full object-contain" draggable={false} />
      {overlay && <DetectionOverlay width={width} height={height} {...overlay} />}
    </div>
  );
}
