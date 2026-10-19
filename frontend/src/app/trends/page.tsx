"use client";

import { useEffect, useState } from "react";
import TrendChart from "@/components/TrendChart";
import { BANDS, CITIES, bandFor, fullDate, getHistory, type History } from "@/lib/api";

const RANGES = [
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
  { label: "Everything", days: 2000 },
] as const;

type Result = { key: string; data?: History; error?: string };

export default function TrendsPage() {
  const [city, setCity] = useState<string>(CITIES[0].key);
  const [days, setDays] = useState<number>(90);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const key = `${city}|${days}|${attempt}`;

  useEffect(() => {
    let cancelled = false;
    getHistory(city, days)
      .then((data) => !cancelled && setResult({ key, data }))
      .catch((e: Error) => !cancelled && setResult({ key, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [city, days, key]);

  const loading = !result || result.key !== key;
  const data = !loading ? result?.data : undefined;
  const error = !loading ? result?.error : undefined;

  const pts = data?.points ?? [];
  const avg = pts.length ? pts.reduce((s, p) => s + p.pm2_5, 0) / pts.length : 0;
  const worst = pts.reduce<(typeof pts)[number] | null>((a, b) => (a === null || b.pm2_5 > a.pm2_5 ? b : a), null);
  const poorDays = pts.filter((p) => p.pm2_5 >= 35).length;
  const shares = BANDS.map((b) => ({
    name: b.name,
    n: pts.filter((p) => bandFor(p.pm2_5).name === b.name).length,
  }));

  return (
    <>
      <h1 className="forecast__title">Trends</h1>
      <p className="section__lead">
        How PM2.5 has moved day by day. The dashed lines show where Good, Moderate,
        Poor and Very poor ranges.
      </p>

      <div className="city-picker trends__pickers" role="group" aria-label="Choose a city">
        {CITIES.map((c) => (
          <button key={c.key} aria-pressed={city === c.key} onClick={() => setCity(c.key)}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="city-picker" role="group" aria-label="Choose how far back to look">
        {RANGES.map((r) => (
          <button key={r.days} aria-pressed={days === r.days} onClick={() => setDays(r.days)}>
            {r.label}
          </button>
        ))}
      </div>

      {loading && <p className="loading">Loading the history&hellip;</p>}

      {error && (
        <div className="notice" role="alert">
          <strong>We couldn&rsquo;t load the history.</strong>
          <p>{error}</p>
          <p>Check that the AirSense server is running, then try again.</p>
          <button onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      )}

      {data && pts.length > 0 && (
        <section aria-live="polite">
          <h2 className="trends__title">
            {data.city}, {fullDate(pts[0].date)} to {fullDate(pts[pts.length - 1].date)}
          </h2>
          <TrendChart points={pts} longRange={days > 120} />

          <dl className="stats">
            <div>
              <dt>Average</dt>
              <dd>{avg.toFixed(1)} µg/m³</dd>
            </div>
            <div>
              <dt>Worst day</dt>
              <dd>
                {worst ? `${worst.pm2_5.toFixed(1)} µg/m³` : "–"}
                {worst && <small>{fullDate(worst.date)}</small>}
              </dd>
            </div>
            <div>
              <dt>Days Poor or worse</dt>
              <dd>
                {poorDays} of {pts.length}
                <small>{((poorDays / pts.length) * 100).toFixed(0)}% of days</small>
              </dd>
            </div>
          </dl>

          <ul className="legend" aria-label="Days in each band">
            {BANDS.map((b, i) => (
              <li key={b.name}>
                <span className="legend__swatch" style={{ background: b.colour }} />
                {b.name}: {shares[i].n} days
              </li>
            ))}
          </ul>
          <p className="section__fine">
            The latest day stored is {fullDate(pts[pts.length - 1].date)}. Values are regional model
            estimates on a grid of about 40 km, not readings from a station in the city.
          </p>
        </section>
      )}
    </>
  );
}