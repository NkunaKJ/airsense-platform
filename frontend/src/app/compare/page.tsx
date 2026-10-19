"use client";

import { useEffect, useState } from "react";
import CityBars from "@/components/CityBars";
import CompareLines from "@/components/CompareLines";
import { BANDS, CITIES, CITY_COLOURS, clockTime, getPrediction, longDate, type Prediction } from "@/lib/api";

type Result = { attempt: number; items: Prediction[]; failed: string[] };

export default function ComparePage() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(CITIES.map((c) => getPrediction(c.key))).then((all) => {
      if (cancelled) return;
      const items: Prediction[] = [];
      const failed: string[] = [];
      all.forEach((r, i) => (r.status === "fulfilled" ? items.push(r.value) : failed.push(CITIES[i].name)));
      setResult({ attempt, items, failed });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const loading = !result || result.attempt !== attempt;
  const items = !loading ? result!.items : [];
  const failed = !loading ? result!.failed : [];
  const ranked = [...items].sort((a, b) => b.predicted_pm2_5 - a.predicted_pm2_5);
  const first = ranked[0];
  const last = ranked[ranked.length - 1];

  return (
    <>
      <h1 className="forecast__title">Compare cities</h1>
      {first && last && (
        <p className="section__lead">
          Lowest PM2.5 tomorrow: <strong>{last.city_name}</strong> ({Math.round(last.predicted_pm2_5)} µg/m³).
          Highest: <strong>{first.city_name}</strong> ({Math.round(first.predicted_pm2_5)} µg/m³).
        </p>
      )}

      {loading && <p className="loading">Getting tomorrow&rsquo;s forecast for all four cities&hellip;</p>}

      {!loading && failed.length > 0 && (
        <div className="notice" role="alert">
          <strong>
            We couldn&rsquo;t get {failed.length === CITIES.length ? "any forecasts" : `the forecast for ${failed.join(" and ")}`}.
          </strong>
          <p>Check that the AirSense server is running, then try again.</p>
          <button onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      )}

      {ranked.length > 0 && (
        <>
          <section className="section section--tight" aria-labelledby="rank-title">
            <h2 id="rank-title">Tomorrow&rsquo;s forecast, city by city</h2>
            <CityBars items={items} />
            <ul className="legend" aria-label="Air quality colours">
              {BANDS.map((b) => (
                <li key={b.name}>
                  <span className="legend__swatch" style={{ background: b.colour }} />
                  {b.name}
                </li>
              ))}
            </ul>
            <div className="table-wrap">
              <table className="table compare-table">
                <thead>
                  <tr>
                    <th scope="col">City</th>
                    <th scope="col">Today</th>
                    <th scope="col">Tomorrow (predicted)</th>
                    <th scope="col">Air quality</th>
                    <th scope="col">Typical error</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((p) => {
                    const band = BANDS.find((b) => b.name === p.band) ?? BANDS[0];
                    const today = p.recent_days.find((d) => d.date === p.based_on_date)?.pm2_5;
                    return (
                      <tr key={p.city}>
                        <th scope="row">{p.city_name}</th>
                        <td>{today == null ? "–" : Math.round(today)} <small>µg/m³</small></td>
                        <td>{Math.round(p.predicted_pm2_5)} <small>µg/m³</small></td>
                        <td style={{ color: band.text, fontWeight: 600 }}>{p.band}</td>
                        <td>±{Math.round(p.typical_error)} <small>µg/m³</small></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="section__fine">
              Typical error is how far off a forecast like this usually is. Updated at {clockTime(ranked[0].refreshed_at)}.
            </p>
          </section>

          <section className="section" aria-labelledby="week-title">
            <h2 id="week-title">The last week and tomorrow</h2>
            <p className="section__lead">
              Daily average PM2.5 in µg/m³. Dashed lines and hollow dots are tomorrow&rsquo;s forecast.
            </p>
            <CompareLines items={items} />
            <ul className="legend" aria-label="City colours">
              {CITIES.map((c) => (
                <li key={c.key}>
                  <span className="legend__line" style={{ borderTopColor: CITY_COLOURS[c.key] }} />
                  {c.name}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}