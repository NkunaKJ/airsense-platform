"use client";

import { useEffect, useState } from "react";
import { BANDS, cityName, getModels, type ModelResult } from "@/lib/api";

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link">
      {children}
    </a>
  );
}

export default function AboutPage() {
  const [models, setModels] = useState<ModelResult[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getModels()
      .then((m) => !cancelled && setModels(m))
      .catch(() => !cancelled && setModels([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const tried = models && models.length > 0
    ? models[0].candidates.map((c) => c.model_name).filter((n) => !n.toLowerCase().startsWith("baseline"))
    : [];
  const neuralWon = models?.some((m) => m.model_name.toLowerCase().includes("neural")) ?? false;
  // Cities whose chosen model did not beat "tomorrow = today" while being tuned.
  const weak =
    models?.filter((m) => m.cv_mae !== null && m.baseline_cv_mae !== null && m.cv_mae >= m.baseline_cv_mae) ?? [];
  const weakNames = weak.map((m) => m.city_name ?? cityName(m.city_key)).join(" and ");
  const weakStillWon = weak.every(
    (m) => m.test_mae !== null && m.baseline_test_mae !== null && m.test_mae < m.baseline_test_mae,
  );

  return (
    <>
      <h1 className="forecast__title">About AirSense</h1>
      <p className="section__lead">
        AirSense predicts tomorrow&rsquo;s fine-particle air pollution (PM2.5) for Johannesburg, Cape Town,
        Durban and Emalahleni, and explains what is behind each forecast. It is a final-year student project.
      </p>

      <section className="section" aria-labelledby="how-title">
        <h2 id="how-title">How the forecast works</h2>
        <ol className="steps">
          <li>
            <strong>Learn from the past.</strong> For each city, the model studied daily PM2.5, other
            pollutants and the weather since August 2022, and learned how today&rsquo;s conditions relate to
            tomorrow&rsquo;s PM2.5.
          </li>
          <li>
            <strong>Read today&rsquo;s conditions.</strong> Each time you open the app, it fetches today&rsquo;s
            air and weather for the city (a result is kept for an hour).
          </li>
          <li>
            <strong>Predict and explain.</strong> The model gives tomorrow&rsquo;s daily average, and AirSense
            shows how much each factor pushed that number up or down.
          </li>
        </ol>
        {tried.length > 0 && (
          <p className="section__lead">
            For each city we tuned and compared {tried.join(", ")}, and checked each against the simple guess
            that tomorrow equals today. The one with the lowest tuning error was kept:{" "}
            {models!.map((m, i) => (
              <span key={m.city_key}>
                {i > 0 && "; "}
                {m.city_name ?? cityName(m.city_key)} uses {m.model_name}
              </span>
            ))}
            . {!neuralWon && "The neural network did not come out best in any city, so it is not used for the forecasts."}{" "}
            See the Analysis page for the scores.
          </p>
        )}
      </section>

      <section className="section" aria-labelledby="bands-title">
        <h2 id="bands-title">What the bands mean</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Band</th>
                <th scope="col">Daily average PM2.5</th>
              </tr>
            </thead>
            <tbody>
              {BANDS.map((b) => (
                <tr key={b.name}>
                  <th scope="row">
                    <span className="legend__swatch legend__swatch--inline" style={{ background: b.colour }} />
                    {b.name}
                  </th>
                  <td>{b.max === null ? `${b.min} µg/m³ and above` : `${b.min} to under ${b.max} µg/m³`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="section__fine">
          This is AirSense&rsquo;s own scale, not an official South African air quality index. The Good limit
          (15) is the World Health Organization&rsquo;s 2021 guideline for a 24-hour average. The Poor and
          Very poor limits (35 and 55) follow the breakpoints the US Environmental Protection Agency uses
          for 24-hour PM2.5 (35.5 and 55.5, rounded).
        </p>
      </section>

      <section className="section" aria-labelledby="limits-title">
        <h2 id="limits-title">What to keep in mind</h2>
        <ul className="plain">
          <li>
            <strong>These are regional estimates, not street readings.</strong> The PM2.5 values come from an
            atmospheric model on a grid of about 45 km. Air on your street can be much cleaner or dirtier.
          </li>
          <li>
            <strong>Forecasts are often off by several units.</strong> The Analysis page shows how far off each
            city&rsquo;s forecasts typically are. Use the range under each forecast, not just the single number.
          </li>
          {weak.length > 0 && (
            <li>
              <strong>Some cities are harder than others.</strong> While it was being tuned, the model for{" "}
              {weakNames} did not beat the simple guess that tomorrow equals today.{" "}
              {weakStillWon
                ? "It did beat it on the final test days, but treat that forecast with extra care."
                : "It did not beat it on the final test days either, so treat that forecast with extra care."}
            </li>
          )}
          <li>
            <strong>The history is a saved snapshot.</strong> The Trends and Analysis pages use a dataset that runs
            to 16 October 2026, so the most recent days are not in it. The Prediction page fetches live values
            when you choose today&rsquo;s data.
          </li>
          <li>
            <strong>Today is partly forecast.</strong> Today&rsquo;s daily average mixes hours already measured with
            the model&rsquo;s forecast for the rest of today.
          </li>
          <li>
            <strong>Health advice is general.</strong> It is not medical advice. If you have a health condition,
            follow your doctor&rsquo;s plan.
          </li>
          <li>
            <strong>Sensors are for information.</strong> The forecast model does not learn from the sensors on
            the Sensors page. Simulated devices are labelled as simulated.
          </li>
        </ul>
      </section>

      <section className="section" aria-labelledby="sources-title">
        <h2 id="sources-title">Where the data comes from</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Source</th>
                <th scope="col">Licence</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">PM2.5 and other pollutants</th>
                <td>
                  Copernicus Atmosphere Monitoring Service (CAMS) global forecasts, through{" "}
                  <Ext href="https://open-meteo.com/en/docs/air-quality-api">Open-Meteo</Ext>
                </td>
                <td>
                  <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext> (Open-Meteo data)
                </td>
              </tr>
              <tr>
                <th scope="row">Weather</th>
                <td>
                  <Ext href="https://open-meteo.com/">Open-Meteo.com</Ext> forecast and archive services
                </td>
                <td>
                  <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext>
                </td>
              </tr>
              <tr>
                <th scope="row">Real sensor readings</th>
                <td>
                  <Ext href="https://sensor.community/en/">Sensor.Community</Ext>, a volunteer sensor network
                </td>
                <td>
                  Published as open data. One public catalogue lists it under the{" "}
                  <Ext href="https://opendatacommons.org/licenses/dbcl/1-0/">Database Contents License 1.0</Ext>.
                  Check Sensor.Community for current terms.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="section__fine">
          Open-Meteo&rsquo;s free service is for non-commercial use only, which is why AirSense is a study
          project and not a product. Contains modified Copernicus Atmosphere Monitoring Service information.
          Neither the European Commission nor ECMWF is responsible for any use made of it.
        </p>
        <p className="section__fine">
          Band limits: <Ext href="https://www.airclim.org/who-air-quality-guidelines">WHO 2021 air quality guidelines (summary)</Ext>;{" "}
          <Ext href="https://www.epa.gov/system/files/documents/2024-02/pm-naaqs-air-quality-index-fact-sheet.pdf">US EPA PM2.5 air quality index fact sheet</Ext>.
        </p>
      </section>
    </>
  );
}