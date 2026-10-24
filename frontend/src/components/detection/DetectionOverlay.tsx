import { memo } from "react";

import { cn } from "@/lib/utils";
import type { DisplayPreferences } from "@/stores/preferences";
import type { Detection } from "@/types/api";
import { classColor, contrastText } from "@/utils/colors";

export interface OverlayProps {
  width: number;
  height: number;
  detections: Detection[];
  display: DisplayPreferences;
  hiddenClasses?: ReadonlySet<number>;
  highlighted?: number | null;
  onHover?: (index: number | null) => void;
  /** Mirror horizontally (selfie camera view). Labels stay readable. */
  mirrored?: boolean;
}

/**
 * Detections rendered as absolutely positioned elements in percentages of the
 * source image, so they stay aligned however the container is resized. The
 * parent must have exactly the image's aspect ratio.
 */
export const DetectionOverlay = memo(function DetectionOverlay({
  width,
  height,
  detections,
  display,
  hiddenClasses,
  highlighted,
  onHover,
  mirrored,
}: OverlayProps) {
  if (!width || !height) return null;
  const visible = detections
    .map((det, index) => ({ det, index }))
    .filter(({ det }) => !hiddenClasses?.has(det.class_id));
  const showLabel = display.showLabels || display.showConfidence;
  const hasShapes = visible.some(({ det }) => det.polygon?.length || det.keypoints?.length);

  return (
    <div className="pointer-events-none absolute inset-0" data-testid="detection-overlay">
      {display.showBoxes && hasShapes && (
        <svg
          className="absolute inset-0 size-full"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          aria-hidden
          style={mirrored ? { transform: "scaleX(-1)" } : undefined}
        >
          {visible.map(({ det, index }) => {
            const color = classColor(det.class_id);
            return (
              <g key={index} opacity={highlighted == null || highlighted === index ? 1 : 0.35}>
                {det.polygon && det.polygon.length > 2 && (
                  <polygon
                    points={det.polygon.map((p) => p.join(",")).join(" ")}
                    fill={color}
                    fillOpacity={0.18}
                    stroke={color}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {det.keypoints
                  ?.filter((kp) => kp.confidence == null || kp.confidence >= 0.5)
                  .map((kp, k) => (
                    <circle key={k} cx={kp.x} cy={kp.y} r={Math.max(2, Math.min(width, height) / 160)} fill={color} />
                  ))}
              </g>
            );
          })}
        </svg>
      )}
      {visible.map(({ det, index }) => {
        const color = classColor(det.class_id);
        const { x1, y1, x2, y2 } = det.bbox;
        const left = mirrored ? width - x2 : x1;
        const style = {
          left: `${(left / width) * 100}%`,
          top: `${(y1 / height) * 100}%`,
          width: `${((x2 - x1) / width) * 100}%`,
          height: `${((y2 - y1) / height) * 100}%`,
        };
        const dimmed = highlighted != null && highlighted !== index;
        const labelInside = y1 / height < 0.06;
        const text = [display.showLabels ? det.class_name : null, display.showConfidence ? `${Math.round(det.confidence * 100)}%` : null]
          .filter(Boolean)
          .join(" ");
        return (
          <div
            key={index}
            className={cn(
              "absolute transition-opacity duration-150",
              onHover && "pointer-events-auto",
              dimmed && "opacity-30",
            )}
            style={style}
            onPointerEnter={onHover ? () => onHover(index) : undefined}
            onPointerLeave={onHover ? () => onHover(null) : undefined}
          >
            {display.showBoxes && (
              <div
                className="absolute inset-0 rounded-[3px]"
                style={{
                  border: `2px solid ${color}`,
                  boxShadow: highlighted === index ? `0 0 0 1px ${color}, 0 0 18px ${color}80` : undefined,
                  background: highlighted === index ? `${color}1f` : undefined,
                }}
              />
            )}
            {showLabel && text && (
              <span
                className={cn(
                  "absolute left-[-2px] max-w-[220px] truncate whitespace-nowrap rounded-[4px] px-1.5 py-px text-[11px] font-semibold leading-4 shadow-sm",
                  labelInside ? "top-0.5 left-0.5" : "bottom-full mb-0.5",
                )}
                style={{ backgroundColor: color, color: contrastText(color) }}
              >
                {text}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});
