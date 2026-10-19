"use client";

import { useEffect, useState } from "react";
import BandShares from "@/components/BandShares";
import CandidateBars from "@/components/CandidateBars";
import CorrChart from "@/components/CorrChart";
import { ResultsTable, TestWindowTable } from "@/components/ModelTables";
import SeasonChart from "@/components/SeasonChart";
import {
  CITIES,
  FEATURE_LABELS,
  MONTHS_LONG,
  cityName,
  fullDate,
  getAnalysis,
  num,
  type Analysis,
} from "@/lib/api";

type Result = { attempt: number; data?: Analysis; error?: string };

export default function AnalysisPage() {
  const [city, setCity] = useState<string>(CITIES[0].key);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAnalysis()
      .then((data) => !cancelled && setResult({ attempt, data }))
      .catch((e: Error) => !cancelled && setResult({ attempt, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const loading = !result || result.attempt !== attempt;
  const data = !loading ? result?.data : undefined;
  const error = !loading ? result?.error : undefined;

  const monthly = data?.monthly.filter((r) => r.city_key === city) ?? [];
  const peak = monthly.reduce<(typeof monthly)[number] | null>(
    (a, b) => (a === null || (b.mean ?? 0) > (a.mean ?? 0) ? b : a),
    null,
  );
  const corr = data?.correlations.find((c) => c.city_key === city)?.correlations ?? [];
  const strongest = [...corr]
    .filter((c) => c.r !== null)
    .sort((a, b) => Math.abs(b.r as number) - Math.abs(a.r as number))[0];
  const model = data?.models.find((m) => m.city_key === city);
  const firstDate = data ? data.summary.map((s) => s.first_date).sort()[0] : "";
  const lastDate = data ? data.summary.map((s) => s.last_date).sort().reverse()[0] : "";
  const cvLosers =
    data?.models.filter(
      (m) => m.cv_mae !== null && m.baseline_cv_mae !== null && m.cv_mae >= m.baseline_cv_mae,
    ) ?? [];

  return (
    <>
      <h1 className="forecast__title">What the data says</h1>
      {data && (
        <p className="section__lead">
          AirSense learns from daily PM2.5 estimates for four cities, from {fullDate(firstDate)} to{" "}
          {fullDate(lastDate)}. This page shows what we found in that data, and how well the model
          predicts days it has never seen.
        </p>
      )}

      {loading && <p className="loading">Loading the analysis&hellip;</p>}

      {error && (
        <div className="notice" role="alert">
          <strong>We couldn&rsquo;t load the analysis.</strong>
          <p>{error}</p>
          <p>Check that the AirSense server is running, then try again.</p>
          <button onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      )}

      {data && (
        <>
          <section className="section" aria-labelledby="data-title">
            <h2 id="data-title">The data</h2>
            <p className="section__lead">
              Each row is one day. PM2.5 is the amount of fine particles in the air, in µg/m³.
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">City</th>
                    <th scope="col">Days</th>
                    <th scope="col">Average</th>
                    <th scope="col">Middle day</th>
                    <th scope="col">Worst 5%</th>
                    <th scope="col">Highest</th>
                  </tr>
                </thead>
                <tbody>
                  {data.summary.map((s) => (
                    <tr key={s.city_key}>
                      <th scope="row">{s.city_name}</th>
                      <td>{s.days_with_pm2_5.toLocaleString("en-ZA")}</td>
                      <td>{num(s.mean)}</td>
                      <td>{num(s.median)}</td>
                      <td>{num(s.p95)}</td>
                      <td>{num(s.max)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="section__fine">
              &ldquo;Worst 5%&rdquo; is the level that only 1 day in 20 goes above. These are regional
              estimates on a grid of about 40 km, not readings from a station in the city.
            </p>
          </section>

          <section className="section" aria-labelledby="band-title">
            <h2 id="band-title">How often the air is in each band</h2>
            <p className="section__lead">Share of all days that fall in each band.</p>
            <BandShares cities={data.bands.cities} />
          </section>

          <div className="city-picker city-picker--sticky" role="group" aria-label="Choose a city for the charts below">
            {CITIES.map((c) => (
              <button key={c.key} aria-pressed={city === c.key} onClick={() => setCity(c.key)}>
                {c.name}
              </button>
            ))}
          </div>

          <section className="section section--tight" aria-labelledby="season-title">
            <h2 id="season-title">{cityName(city)} through the year</h2>
            {peak && (
              <p className="section__lead">
                The average is highest in <strong>{MONTHS_LONG[peak.month - 1]}</strong> at{" "}
                {num(peak.mean, 0)} µg/m³. The dashed line is the level that the worst 1 day in 10
                goes above.
              </p>
            )}
            <SeasonChart rows={monthly} />
            <ul className="legend" aria-label="Line key">
              <li><span className="legend__line legend__line--mean" />Monthly average</li>
              <li><span className="legend__line legend__line--p90" />Worst 10% of days</li>
            </ul>
          </section>

          <section className="section" aria-labelledby="corr-title">
            <h2 id="corr-title">What goes with tomorrow&rsquo;s PM2.5 in {cityName(city)}</h2>
            <p className="section__lead">
              Each bar compares one of today&rsquo;s measurements with tomorrow&rsquo;s PM2.5. A bar to
              the right means tomorrow tends to be higher when that measurement is higher. A bar to the
              left means lower. Longer bars mean a stronger link.
              {strongest && (
                <>
                  {" "}
                  The strongest link here is{" "}
                  <strong>{FEATURE_LABELS[strongest.feature] ?? strongest.feature}</strong>{" "}
                  ({(strongest.r as number) > 0 ? "+" : "\u2212"}
                  {Math.abs(strongest.r as number).toFixed(2)}).
                </>
              )}
            </p>
            <CorrChart rows={corr} />
            <p className="section__fine">
              A link is not a cause. Two things can move together without one driving the other.
            </p>
          </section>

          <section className="section" aria-labelledby="models-title">
            <h2 id="models-title">How well the model predicts</h2>
            <p className="section__lead">
              The simplest possible forecast says tomorrow will be the same as today. A useful model has
              to beat that. These scores come from the last part of each city&rsquo;s data, days the
              model never saw while learning. &ldquo;Typical miss&rdquo; is the average gap between
              forecast and actual, so lower is better.
            </p>
            <ResultsTable results={data.models} />
            <p className="section__fine">
              R&sup2; is the share of day-to-day ups and downs the model explains. 1 is perfect, 0 is no
              better than always guessing the average.
            </p>
            {cvLosers.length > 0 && (
              <div className="notice notice--info">
                <strong>Read {cvLosers.map((m) => m.city_name ?? cityName(m.city_key)).join(" and ")} with extra care.</strong>
                <p>
                  While the model was being tuned, its cross-validation score for{" "}
                  {cvLosers.map((m) => m.city_name ?? cityName(m.city_key)).join(" and ")} did not beat
                  &ldquo;tomorrow = today&rdquo;. On the final test days it did, but the result is less
                  certain than for the other cities.
                </p>
              </div>
            )}
          </section>

          {model && (
            <section className="section" aria-labelledby="cands-title">
              <h2 id="cands-title">Models we tried for {cityName(city)}</h2>
              <p className="section__lead">
                Every model was tuned and scored the same way, on slices of the training period that come
                one after another in time. The one with the lowest score was chosen.
              </p>
              <CandidateBars candidates={model.candidates} />
              <p className="section__fine">
                Typical miss in µg/m³ during tuning. Lower is better. The model was trained on{" "}
                {model.train_rows.toLocaleString("en-ZA")} days, up to {fullDate(model.train_end)}, and
                tested on the next {model.test_rows.toLocaleString("en-ZA")} days.
              </p>
            </section>
          )}

          <section className="section" aria-labelledby="window-title">
            <h2 id="window-title">Was the test period typical?</h2>
            <p className="section__lead">
              If the test days were much dirtier or cleaner than the training days, scores are harder to
              compare. Here are the averages for each period.
            </p>
            <TestWindowTable rows={data.testWindow} />
          </section>
        </>
      )}
    </>
  );
}