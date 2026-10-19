import type { SensorSeries } from "@/lib/api";

const W = 520;
const H = 280;
const M = { l: 38, r: 14, t: 14, b: 30 };
const GAP_MS = 30 * 60000; // a gap longer than this breaks the line

export const DEVICE_COLOURS = ["#1c2a35", "#2d7fc0", "#1f9a8a", "#b8651b", "#7a4fb5"];

function tick(ms: number, hours: number) {
  const d = new Date(ms);
  const opts: Intl.DateTimeFormatOptions = { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hour12: false };
  const time = d.toLocaleTimeString("en-ZA", opts);
  if (hours <= 24) return time;
  return `${d.toLocaleDateString("en-ZA", { weekday: "short", timeZone: "Africa/Johannesburg" })} ${time}`;
}

export default function SensorChart({
  series,
  hours,
  now,
}: {
  series: SensorSeries[];
  hours: number;
  now: number;
}) {
  const start = now - hours * 3600000;
  const x = (ms: number) => M.l + ((ms - start) / (now - start)) * (W - M.l - M.r);
  const all = series.flatMap((s) => s.points.map((p) => p.pm2_5).filter((v): v is number => v !== null));
  const top = Math.max(20, Math.ceil(Math.max(...all, 0) / 10) * 10);
  const y = (v: number) => M.t + (1 - v / top) * (H - M.t - M.b);
  const step = top > 60 ? 20 : 10;
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  const xTicks = Array.from({ length: 5 }, (_, i) => start + (i / 4) * (now - start));

  return (
    <div>
      <svg className="chart chart--wide" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`PM2.5 from each device over the last ${hours} hours`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="chart__grid" />
            <text x={M.l - 6} y={y(t) + 4} textAnchor="end" className="chart__text">{t}</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} x={x(t)} y={H - 8} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} className="chart__text">
            {tick(t, hours)}
          </text>
        ))}
        {series.map((s, idx) => {
          const colour = DEVICE_COLOURS[idx % DEVICE_COLOURS.length];
          const pts = s.points
            .filter((p) => p.pm2_5 !== null)
            .map((p) => ({ t: new Date(p.time).getTime(), v: p.pm2_5 as number }));
          let d = "";
          pts.forEach((p, i) => {
            const brk = i === 0 || p.t - pts[i - 1].t > GAP_MS;
            d += `${brk ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)} `;
          });
          const lone = pts.filter((p, i) => (i === 0 || p.t - pts[i - 1].t > GAP_MS) && (i === pts.length - 1 || pts[i + 1].t - p.t > GAP_MS));
          return (
            <g key={s.device_key}>
              <path d={d} fill="none" stroke={colour} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.is_simulated ? "5 4" : undefined} />
              {lone.map((p) => (
                <circle key={p.t} cx={x(p.t)} cy={y(p.v)} r={3} fill={colour} />
              ))}
            </g>
          );
        })}
      </svg>
      <ul className="legend" aria-label="Devices">
        {series.map((s, idx) => (
          <li key={s.device_key}>
            <span
              className="legend__line"
              style={{
                borderTop: `3px ${s.is_simulated ? "dashed" : "solid"} ${DEVICE_COLOURS[idx % DEVICE_COLOURS.length]}`,
              }}
            />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}