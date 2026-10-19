import { BANDS, cityName, type BandShare } from "@/lib/api";

export default function BandShares({ cities }: { cities: BandShare[] }) {
  return (
    <div>
      <ul className="stack">
        {cities.map((c) => (
          <li key={c.city_key} className="stack__row">
            <span className="stack__name">{cityName(c.city_key)}</span>
            <span
              className="stack__bar"
              role="img"
              aria-label={BANDS.map((b) => `${b.name} ${c.share_pct[b.name] ?? 0} percent`).join(", ")}
            >
              {BANDS.map((b) => {
                const v = c.share_pct[b.name] ?? 0;
                return (
                  <span key={b.name} className="stack__seg" style={{ width: `${v}%`, background: b.colour }}>
                    {v >= 7 && <span>{Math.round(v)}%</span>}
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
      <ul className="legend" aria-label="Colour key">
        {BANDS.map((b) => (
          <li key={b.name}>
            <span className="legend__swatch" style={{ background: b.colour }} />
            {b.name} ({b.max === null ? `${b.min}+` : `${b.min} to ${b.max}`})
          </li>
        ))}
      </ul>
    </div>
  );
}