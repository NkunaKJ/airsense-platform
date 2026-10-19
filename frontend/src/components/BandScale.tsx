import { BANDS } from "@/lib/api";

// The scale runs from 0 to 75 µg/m³. "Very poor" is open-ended, so the
// last segment simply stands for everything from 55 upwards.
const SCALE_MAX = 75;
const pct = (v: number) => `${(Math.min(Math.max(v, 0), SCALE_MAX) / SCALE_MAX) * 100}%`;

export default function BandScale({
  value,
  error,
}: {
  value: number;
  error: number;
}) {
  const low = Math.max(0, value - error);
  const high = Math.min(SCALE_MAX, value + error);

  return (
    <div
      className="ribbon"
      role="img"
      aria-label={`Predicted ${value} micrograms per cubic metre, typically off by about ${error}`}
    >
      <div className="ribbon__track">
        {BANDS.map((b) => {
          const upper = b.max ?? SCALE_MAX;
          return (
            <div
              key={b.name}
              className="ribbon__segment"
              style={{ width: `${((upper - b.min) / SCALE_MAX) * 100}%`, background: b.colour }}
            />
          );
        })}
      </div>
      <div className="ribbon__zone">
        <div className="ribbon__error" style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }} />
        <div className="ribbon__marker" style={{ left: pct(value) }}>
          <span className="ribbon__marker-label">{value}</span>
        </div>
      </div>
      <div className="ribbon__labels">
        {BANDS.map((b) => {
          const upper = b.max ?? SCALE_MAX;
          return (
            <div
              key={b.name}
              className="ribbon__label"
              style={{ width: `${((upper - b.min) / SCALE_MAX) * 100}%` }}
            >
              {b.name}
              <small>{b.max === null ? `${b.min}+` : `${b.min} to ${b.max}`}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}