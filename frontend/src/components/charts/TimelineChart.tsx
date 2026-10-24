import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { TimelinePoint } from "@/types/api";
import { formatClock } from "@/utils/format";
import { AXIS_TICK, ChartTooltipBody, GRID_STROKE, SERIES } from "./ChartTooltip";

/** Objects detected per analysed frame over the video's timeline. */
export function TimelineChart({ points, height = 200 }: { points: TimelinePoint[]; height?: number }) {
  if (points.length === 0) return <p className="text-sm text-muted-foreground">No frames were analysed.</p>;
  return (
    <figure className="space-y-2">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="timeline-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES} stopOpacity={0.14} />
                <stop offset="100%" stopColor={SERIES} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeWidth={1} />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v: number) => formatClock(v)}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
              minTickGap={32}
            />
            <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              cursor={{ stroke: "rgb(var(--muted-foreground))", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as TimelinePoint;
                return <ChartTooltipBody title={`${formatClock(p.t)} · frame ${p.frame}`} value={p.count} label="objects" />;
              }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke={SERIES}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="url(#timeline-fill)"
              isAnimationActive={false}
              activeDot={{ r: 4, fill: SERIES, stroke: "rgb(var(--card))", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        <table>
          <caption>Objects detected per analysed frame</caption>
          <thead>
            <tr>
              <th>Time (s)</th>
              <th>Frame</th>
              <th>Objects</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.frame}>
                <td>{p.t}</td>
                <td>{p.frame}</td>
                <td>{p.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
