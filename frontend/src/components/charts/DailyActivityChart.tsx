import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { StatsResponse } from "@/types/api";
import { formatCompact, formatNumber } from "@/utils/format";
import { AXIS_TICK, ChartTooltipBody, GRID_STROKE, SERIES } from "./ChartTooltip";

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/** Detections per day (UTC) for the last N days. */
export function DailyActivityChart({ daily, height = 220 }: { daily: StatsResponse["daily"]; height?: number }) {
  return (
    <figure>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={daily} margin={{ top: 8, right: 4, bottom: 0, left: -12 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeWidth={1} />
            <XAxis dataKey="date" tickFormatter={dayLabel} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} minTickGap={16} />
            <YAxis allowDecimals={false} tickFormatter={(v: number) => formatCompact(v)} tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              cursor={{ fill: "rgb(var(--accent))", opacity: 0.5 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as StatsResponse["daily"][number];
                return <ChartTooltipBody title={`${dayLabel(d.date)} · ${d.jobs} job${d.jobs === 1 ? "" : "s"}`} value={formatNumber(d.detections)} label="detections" />;
              }}
            />
            <Bar dataKey="detections" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} activeBar={{ fill: SERIES, opacity: 0.85 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        <table>
          <caption>Detections per day</caption>
          <thead>
            <tr>
              <th>Date</th>
              <th>Jobs</th>
              <th>Detections</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.date}>
                <td>{d.date}</td>
                <td>{d.jobs}</td>
                <td>{d.detections}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
