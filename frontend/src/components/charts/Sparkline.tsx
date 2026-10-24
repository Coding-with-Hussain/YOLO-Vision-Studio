import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

/** Minimal trend line for stat tiles; the latest point gets an end dot. */
export function Sparkline({ values, height = 36 }: { values: number[]; height?: number }) {
  const data = values.map((v, i) => ({ i, v }));
  if (data.length < 2) return <div style={{ height }} aria-hidden />;
  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 5, bottom: 4, left: 5 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="v"
            stroke="rgb(var(--primary))"
            strokeWidth={2}
            dot={(props: { cx?: number; cy?: number; index?: number }) =>
              props.index === data.length - 1 && props.cx != null && props.cy != null ? (
                <circle key="end" cx={props.cx} cy={props.cy} r={4} fill="rgb(var(--primary))" stroke="rgb(var(--card))" strokeWidth={2} />
              ) : (
                <g key={props.index} />
              )
            }
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
