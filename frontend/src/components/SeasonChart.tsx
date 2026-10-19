import { MONTHS, type MonthRow } from "@/lib/api";

const W = 480;
const H = 260;
const M = { l: 38, r: 14, t: 14, b: 30 };

export default function SeasonChart({ rows }: { rows: MonthRow[] }) {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const top = Math.max(10, Math.ceil(Math.max(...rows.map((r) => r.p90 ?? r.mean ?? 0)) / 10) * 10);
  const x = (m: number) => M.l + ((m - 1) / 11) * (W - M.l - M.r);
  const y = (v: number) => M.t + (1 - v / top) * (H - M.t - M.b);
  const ticks = Array.from({ length: top / 10 + 1 }, (_, i) => i * 10);

  const line = (key: "mean" | "p90") =>
    MONTHS.map((_, i) => ({ m: i + 1, v: byMonth.get(i + 1)?.[key] ?? null }))
      .filter((p): p is { m: number; v: number } => p.v !== null)
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.m).toFixed(1)},${y(p.v).toFixed(1)}`)
      .join(" ");

  const means = rows.filter((r) => r.mean !== null);
  const peak = means.reduce((a, b) => ((b.mean ?? 0) > (a.mean ?? 0) ? b : a), means[0]);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Average and 90th percentile PM2.5 for each month of the year">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="chart__grid" />
          <text x={M.l - 6} y={y(t) + 4} textAnchor="end" className="chart__text">{t}</text>
        </g>
      ))}
      {MONTHS.map((m, i) => (
        <text key={m} x={x(i + 1)} y={H - 8} textAnchor="middle" className="chart__text">{m}</text>
      ))}
      <path d={line("p90")} className="chart__line chart__line--p90" />
      <path d={line("mean")} className="chart__line chart__line--mean" />
      {means.map((r) => (
        <circle key={r.month} cx={x(r.month)} cy={y(r.mean as number)} r={r.month === peak?.month ? 5 : 3} className="chart__dot" />
      ))}
      {peak && (
        <text x={x(peak.month)} y={y(peak.mean as number) + 22} textAnchor="middle" className="chart__text chart__text--strong">
          {(peak.mean as number).toFixed(0)}
        </text>
      )}
    </svg>
  );
}