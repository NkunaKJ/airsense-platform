import { BANDS, type Prediction } from "@/lib/api";

const W = 560;
const H = 300;
const M = { l: 56, r: 16, t: 16, b: 34 };

// Bars for tomorrow's forecast, lowest on the left to highest on the right,
// each coloured by its air-quality band.
export default function CityBars({ items }: { items: Prediction[] }) {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => a.predicted_pm2_5 - b.predicted_pm2_5);
  const maxV = Math.max(...sorted.map((p) => p.predicted_pm2_5), 20);
  const top = Math.ceil(maxV / 10) * 10;
  const step = top > 60 ? 20 : 10;
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  const y = (v: number) => M.t + (1 - v / top) * (H - M.t - M.b);
  const slot = (W - M.l - M.r) / sorted.length;
  const bw = Math.min(72, slot * 0.6);

  return (
    <svg
      className="cbars"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Predicted PM2.5 for tomorrow: ${sorted
        .map((p) => `${p.city_name} ${Math.round(p.predicted_pm2_5)}`)
        .join(", ")} micrograms per cubic metre`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="cbars__grid" />
          <text x={M.l - 8} y={y(t) + 4} textAnchor="end" className="cbars__text">{t}</text>
        </g>
      ))}
      <text
        transform={`translate(13 ${(M.t + H - M.b) / 2}) rotate(-90)`}
        textAnchor="middle"
        className="cbars__text"
      >
        Predicted PM2.5 for tomorrow (µg/m³)
      </text>
      {sorted.map((p, i) => {
        const band = BANDS.find((b) => b.name === p.band) ?? BANDS[0];
        const cx = M.l + slot * i + slot / 2;
        const v = Math.round(p.predicted_pm2_5);
        return (
          <g key={p.city}>
            <rect x={cx - bw / 2} y={y(p.predicted_pm2_5)} width={bw} height={y(0) - y(p.predicted_pm2_5)} rx={2} fill={band.colour} />
            <text x={cx} y={y(p.predicted_pm2_5) - 6} textAnchor="middle" className="cbars__value">{v}</text>
            <text x={cx} y={H - 12} textAnchor="middle" className="cbars__text cbars__text--city">{p.city_name}</text>
          </g>
        );
      })}
      <line x1={M.l} x2={W - M.r} y1={y(0)} y2={y(0)} className="cbars__base" />
    </svg>
  );
}