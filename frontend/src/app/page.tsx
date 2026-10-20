"use client";

import { useEffect, useRef, useState } from "react";
import Advice from "@/components/Advice";
import BandScale from "@/components/BandScale";
import ConditionsPicker, { type Mode } from "@/components/ConditionsPicker";
import DriverChart from "@/components/DriverChart";
import RecentDays from "@/components/RecentDays";
import {
  BANDS,
  bandFor,
  CITIES,
  clockTime,
  fullDate,
  getDay,
  getLive,
  getRange,
  longDate,
  manualFromLive,
  postManual,
  todayIso,
  type DatasetRange,
  type ManualValues,
  type PredictionResult,
} from "@/lib/api";

// One request for a forecast. A new id means "run it again".
type Request = { id: number; city: string; mode: Mode; date: string; manual: ManualValues };
type Outcome = { id: number; data?: PredictionResult; error?: string };
type RangeState = { city: string; data?: DatasetRange; failed?: boolean };

// Which bands the "typical miss" range touches, e.g. "Moderate to Poor".
function rangeText(value: number, error: number): string {
  const low = Math.max(0, value - error);
  const high = value + error;
  const hit = BANDS.filter((b) => high >= b.min && low < (b.max ?? Infinity));
  const first = hit[0].name;
  const last = hit[hit.length - 1].name;
  const span = first === last ? `${first}` : `anywhere from ${first} to ${last}`;
  return `Predictions like this are typically off by about ${error} µg/m³, so the real value could be ${span}.`;
}

export default function PredictionPage() {
  const [city, setCity] = useState<string>("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [manual, setManual] = useState<ManualValues>({});
  const [rangeState, setRangeState] = useState<RangeState | null>(null);
  const [filling, setFilling] = useState(false);
  const [fillError, setFillError] = useState<string | null>(null);

  const nextId = useRef(2);
  const [request, setRequest] = useState<Request | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // Run the current request. Nothing runs until the Predict button is pressed.
  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    const call =
      request.mode === "today"
        ? getLive(request.city)
        : request.mode === "day"
          ? getDay(request.city, request.date)
          : postManual(request.city, request.manual);
    call
      .then((data) => !cancelled && setOutcome({ id: request.id, data }))
      .catch((e: Error) => !cancelled && setOutcome({ id: request.id, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [request]);

  // The list of recorded days (and usual values) for the city, needed by the other two options.
  useEffect(() => {
    if (!city || !mode || mode === "today") return;
    let cancelled = false;
    getRange(city)
      .then((data) => !cancelled && setRangeState({ city, data }))
      .catch(() => !cancelled && setRangeState({ city, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [city, mode]);

  const range = rangeState?.city === city ? (rangeState.data ?? null) : null;
  const rangeFailed = rangeState?.city === city && !!rangeState.failed;
  const date = pickedDate ?? range?.last ?? "";
  const dateOk = !!range && date >= range.first && date <= range.last;

  const loading = request !== null && outcome?.id !== request.id;
  const data = request && outcome?.id === request.id ? outcome.data : undefined;
  const error = request && outcome?.id === request.id ? outcome.error : undefined;
  const band = data ? BANDS.find((b) => b.name === data.band) : undefined;

  function ask(next: Omit<Request, "id"> | null) {
    setRequest(next ? { id: nextId.current++, ...next } : null);
  }

  function chooseCity(key: string) {
    setCity(key);
    setPickedDate(null);
    setFillError(null);
    ask(null); // a new city clears the old forecast; the Predict button starts the next one
  }

  function chooseMode(next: Mode) {
    setMode(next);
    setFillError(null);
    if (next === "manual" && !manual.date) setManual((m) => ({ ...m, date: todayIso() }));
    ask(null);
  }

  function predict() {
    if (!city || !mode) return;
    ask({ city, mode, date, manual });
  }

  function fillFromToday() {
    if (!city) return;
    setFilling(true);
    setFillError(null);
    getLive(city)
      .then((p) => setManual(manualFromLive(p)))
      .catch((e: Error) => setFillError(`We couldn’t get today’s values. ${e.message}`))
      .finally(() => setFilling(false));
  }

  const live = data?.source === "live";

  return (
    <>
      <label className="city-select">
        <span className="city-select__label">First, choose a city</span>
        <select value={city} onChange={(e) => chooseCity(e.target.value)}>
          <option value="" disabled>
            Choose a city&hellip;
          </option>
          {CITIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <ConditionsPicker
        mode={mode}
        hasCity={city !== ""}
        onMode={chooseMode}
        range={range}
        rangeFailed={rangeFailed}
        date={date}
        dateOk={dateOk}
        onDate={setPickedDate}
        manual={manual}
        onManual={(key, value) => setManual((m) => ({ ...m, [key]: value }))}
        onFill={fillFromToday}
        filling={filling}
        fillError={fillError}
        busy={loading}
        onPredict={predict}
      />

      {!request && (
        <p className="loading">Choose a city, choose how to get today&rsquo;s conditions, then press Predict.</p>
      )}
      {loading && <p className="loading">Getting the forecast&hellip;</p>}

      {error && (
        <div className="notice" role="alert">
          <strong>We couldn&rsquo;t get the forecast.</strong>
          <p>{error}</p>
          {request?.mode === "today" && (
            <>
              <p>Check that the AirSense server is running, then try again.</p>
              <button onClick={() => request && ask({ ...request })}>Try again</button>
            </>
          )}
        </div>
      )}

      {data && band && (
        <section className="forecast" aria-live="polite">
          <h1 className="forecast__title">
            {live ? `${data.city_name} tomorrow` : `${data.city_name}, the day after ${fullDate(data.based_on_date)}`}
          </h1>
          <p className="forecast__date">
            {live ? longDate(data.predicts_for_date) : fullDate(data.predicts_for_date)}
          </p>

          <div className="forecast__reading">
            <span className="forecast__value">{Math.round(data.predicted_pm2_5)}</span>
            <span className="forecast__unit">µg/m³ of PM2.5</span>
          </div>
          <p className="forecast__band" style={{ color: band.text }}>
            {data.band}
          </p>

          <BandScale value={Math.round(data.predicted_pm2_5)} error={Math.round(data.typical_error)} />
          <p className="forecast__range">{rangeText(data.predicted_pm2_5, Math.round(data.typical_error))}</p>

          <p className="forecast__meta">
            {live && (
              <>
                Updated at {clockTime(data.refreshed_at)} from live data for {longDate(data.based_on_date)}.
              </>
            )}
            {data.source === "day" && <>Based on the recorded conditions for {fullDate(data.based_on_date)}.</>}
            {data.source === "manual" && <>Based on the values you entered for {fullDate(data.based_on_date)}.</>}
          </p>
        </section>
      )}

      {data && band && data.source === "day" && (
        <div className="notice notice--info">
          {data.actual_next_day !== null && data.actual_next_day !== undefined ? (
            <p>
              <strong>What actually happened:</strong> {Math.round(data.actual_next_day)} µg/m³ (
              {bandFor(data.actual_next_day).name}) on {fullDate(data.predicts_for_date)}. The model predicted{" "}
              {Math.round(data.predicted_pm2_5)} ({data.band}).
            </p>
          ) : (
            <p>
              <strong>Nothing to compare with.</strong> The day after this one is not in the dataset yet.
            </p>
          )}
          <p>{data.note}</p>
        </div>
      )}

      {data && band && data.source === "manual" && (
        <>
          {data.unusual_inputs && data.unusual_inputs.length > 0 && (
            <div className="notice" role="note">
              <strong>Some values are far from what {data.city_name} usually sees.</strong>
              <ul className="plain">
                {data.unusual_inputs.map((u) => (
                  <li key={u.factor}>
                    {u.factor}: you entered {u.value} {u.unit}; a typical day is {u.usual} {u.unit}.
                  </li>
                ))}
              </ul>
              <p>The model learned from {data.city_name}&rsquo;s own history, so a forecast from values like these may be unreliable.</p>
            </div>
          )}
          <div className="notice notice--info">
            <p>{data.note}</p>
          </div>
        </>
      )}

      {data && band && (
        <>
          <DriverChart explanation={data.explanation} predicted={data.predicted_pm2_5} />
          <Advice key={`${data.city}-${data.source}-${data.based_on_date}`} advice={data.advice} bandText={band.text} />
          <RecentDays
            days={data.recent_days}
            tomorrow={data.predicted_pm2_5}
            tomorrowDate={data.predicts_for_date}
            source={data.source}
          />
        </>
      )}
    </>
  );
}