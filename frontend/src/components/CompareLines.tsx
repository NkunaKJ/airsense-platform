import { CITY_COLOURS, cityName, dayMonth, type Prediction } from "@/lib/api";

const W = 520;
const H = 280;
const M = { l: 38, r: 124, t: 14, b: 30 };

export default function CompareLines({ items }: { items: Prediction[] }) {
  if (items.length === 0) return null;
  const dates = [...items[0].recent_days.map((d) => d.date), items[0].predicts_for_date];
  const n = dates.length;
  const series = items.map((p) => ({
    key: p.city,
    values: [...p.recent_days.map((d) => d.pm2_5), p.predicted_pm2_5] as (number | null)[],
  }));
  const maxV = Math.max(...series.flatMap((s) => s.values.filter((v): v is number => v !== null)), 20);
  const top = Math.ceil(maxV / 10) * 10;
  const x = (i: number) => M.l + (i / (n - 1)) * (W - M.l - M.r);
  const y = (v: number) => M.t + (1 - v / top) * (H - M.t - M.b);
  const ticks = Array.from({ length: top / 10 + 1 }, (_, i) => i * 10).filter((t) => t % (top > 60 ? 20 : 10) === 0);

  // Direct labels at the right end, nudged apart so they never overlap.
  const ends = series
    .map((s) => ({ key: s.key, v: s.values[n - 1] as number, y: y(s.values[n - 1] as number) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;

  return (
    <svg className="chart chart--wide" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily PM2.5 for the last week and tomorrow's forecast, for all four cities">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="chart__grid" />
          <text x={M.l - 6} y={y(t) + 4} textAnchor="end" className="chart__text">{t}</text>
        </g>
      ))}
      {dates.map((d, i) =>
        (i % 2 === 0 && i !== n - 2) || i === n - 1 ? (
          <text key={d} x={x(i)} y={H - 8} textAnchor="middle" className="chart__text">
            {i === n - 1 ? "Tomorrow" : dayMonth(d)}
          </text>
        ) : null,
      )}
      {series.map((s) => {
        const colour = CITY_COLOURS[s.key] ?? "#555";
        const past = s.values
          .slice(0, n - 1)
          .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
          .filter(Boolean)
          .join(" L");
        const last = s.values[n - 2];
        const fc = s.values[n - 1] as number;
        return (
          <g key={s.key}>
            <path d={`M${past}`} fill="none" stroke={colour} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {last !== null && (
              <path
                d={`M${x(n - 2).toFixed(1)},${y(last).toFixed(1)} L${x(n - 1).toFixed(1)},${y(fc).toFixed(1)}`}
                fill="none"
                stroke={colour}
                strokeWidth={2.5}
                strokeDasharray="4 4"
              />
            )}
            <circle cx={x(n - 1)} cy={y(fc)} r={4.5} fill="var(--paper)" stroke={colour} strokeWidth={2.5} />
          </g>
        );
      })}
      {ends.map((e) => (
        <text key={e.key} x={W - M.r + 10} y={e.y + 4} className="chart__text chart__text--strong" style={{ fill: CITY_COLOURS[e.key] }}>
          {cityName(e.key)} {Math.round(e.v)}
        </text>
      ))}
    </svg>
  );
}