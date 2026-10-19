// Where the back end lives. In the browser this is your computer's port 8000.
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const CITIES = [
  { key: "johannesburg", name: "Johannesburg" },
  { key: "capetown", name: "Cape Town" },
  { key: "durban", name: "Durban" },
  { key: "emalahleni", name: "Emalahleni" },
] as const;

// PM2.5 bands in µg/m³. Keep in step with backend/app/advice.py.
export const BANDS = [
  { name: "Good", min: 0, max: 15, colour: "var(--band-good)", text: "#1f7a3a" },
  { name: "Moderate", min: 15, max: 35, colour: "var(--band-moderate)", text: "#7a6200" },
  { name: "Poor", min: 35, max: 55, colour: "var(--band-poor)", text: "#a85407" },
  { name: "Very poor", min: 55, max: null, colour: "var(--band-very-poor)", text: "#a82828" },
] as const;

export type Driver = {
  factor: string;
  effect: number;
  direction: "up" | "down";
  today?: number;
  usual?: number;
  unit?: string;
};

export type Explanation = {
  typical_day_prediction: number;
  drivers: Driver[];
  method: string;
  how_to_read: string;
};

export type Advice = {
  band: string;
  colour: string;
  alert_level: string;
  general: string;
  groups: { key: string; label: string; advice: string }[];
  personal: Record<string, string[]>;
  disclaimer: string;
};

export type Prediction = {
  city: string;
  city_name: string;
  model_name: string;
  based_on_date: string;
  predicts_for_date: string;
  predicted_pm2_5: number;
  band: string;
  typical_error: number;
  advice: Advice;
  explanation: Explanation;
  note: string;
  recent_days: { date: string; pm2_5: number | null }[];
  refreshed_at: string;
};

export async function getPrediction(city: string): Promise<Prediction> {
  const res = await fetch(`${API_URL}/predict/${city}`);
  if (!res.ok) {
    let detail = `The server answered with status ${res.status}.`;
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* keep the default message */
    }
    throw new Error(detail);
  }
  return res.json();
}

// "2026-10-18" -> "Sunday 18 October"
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// UTC timestamp from the API -> South African clock time, e.g. "17:32"
export function clockTime(isoUtc: string): string {
  return new Date(isoUtc).toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Johannesburg",
  });
}

// "2026-10-17" -> "Sat 17"
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${dt.toLocaleDateString("en-ZA", { weekday: "short" })} ${d}`;
}

export function bandFor(value: number) {
  return [...BANDS].reverse().find((b) => value >= b.min) ?? BANDS[0];
}

/* ---------- Analysis page data ---------- */

export const FEATURE_LABELS: Record<string, string> = {
  pm2_5: "Today's PM2.5",
  pm10: "Coarse particles (PM10)",
  nitrogen_dioxide: "Nitrogen dioxide",
  ozone: "Ozone",
  temperature_2m: "Temperature",
  relative_humidity_2m: "Humidity",
  wind_speed_10m: "Wind speed",
  precipitation: "Rain",
  surface_pressure: "Air pressure",
};

export type CitySummary = {
  city_key: string;
  city_name: string;
  days_with_pm2_5: number;
  first_date: string;
  last_date: string;
  mean: number | null;
  std: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
  p95: number | null;
};
export type MonthRow = { city_key: string; month: number; mean: number | null; median: number | null; p90: number | null };
export type BandShare = { city_key: string; days: number; share_pct: Record<string, number | null> };
export type CorrRow = { city_key: string; correlations: { feature: string; r: number | null }[] };
export type TestWindowRow = {
  city_key: string;
  test_start: string;
  train_mean: number | null;
  test_mean: number | null;
  train_p90: number | null;
  test_p90: number | null;
};
export type Candidate = { model_name: string; cv_mae: number | null; params: Record<string, unknown>; is_selected: boolean };
export type ModelResult = {
  city_key: string;
  city_name: string | null;
  model_name: string;
  cv_mae: number | null;
  baseline_cv_mae: number | null;
  test_mae: number | null;
  test_rmse: number | null;
  test_r2: number | null;
  baseline_test_mae: number | null;
  train_rows: number;
  test_rows: number;
  train_end: string;
  test_start: string;
  improvement_pct: number | null;
  candidates: Candidate[];
};

export type Analysis = {
  summary: CitySummary[];
  monthly: MonthRow[];
  bands: { bands: { name: string; min: number; max: number | null }[]; cities: BandShare[] };
  correlations: CorrRow[];
  testWindow: TestWindowRow[];
  models: ModelResult[];
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`The server answered ${res.status} for ${path}.`);
  return res.json();
}

export async function getAnalysis(): Promise<Analysis> {
  const [summary, monthly, bands, correlations, testWindow, models] = await Promise.all([
    getJson<CitySummary[]>("/eda/summary"),
    getJson<MonthRow[]>("/eda/monthly"),
    getJson<Analysis["bands"]>("/eda/bands"),
    getJson<CorrRow[]>("/eda/correlations"),
    getJson<TestWindowRow[]>("/eda/test-window"),
    getJson<ModelResult[]>("/models/results"),
  ]);
  return { summary, monthly, bands, correlations, testWindow, models };
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function cityName(key: string): string {
  return CITIES.find((c) => c.key === key)?.name ?? key;
}

// "2026-09-24" -> "24 September 2026"
export function fullDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
}

export function num(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "–" : v.toFixed(digits);
}

/* ---------- Trends and Compare ---------- */

export type HistoryPoint = { date: string; pm2_5: number };
export type History = { city: string; points: HistoryPoint[] };

export async function getHistory(city: string, days: number): Promise<History> {
  const res = await fetch(`${API_URL}/cities/${city}/history?days=${days}`);
  if (!res.ok) throw new Error(`The server answered ${res.status} for the history of ${cityName(city)}.`);
  return res.json();
}

// One colour per city on the Compare chart. Chosen to stay apart for colour-blind readers.
export const CITY_COLOURS: Record<string, string> = {
  johannesburg: "#1c2a35",
  capetown: "#2d7fc0",
  durban: "#1f9a8a",
  emalahleni: "#b8651b",
};

// "2026-09-25" -> "25 Sep"  (or "Sep 2026" when withYear is true)
export function dayMonth(iso: string, withYear = false): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return withYear
    ? dt.toLocaleDateString("en-ZA", { month: "short", year: "numeric" })
    : dt.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

/* ---------- Sensors (IoT) ---------- */

export type Device = {
  device_key: string;
  label: string;
  is_simulated: boolean;
  reading_time: string | null;
  pm2_5: number | null;
  pm10: number | null;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
};

export type SensorPoint = { time: string; pm2_5: number | null; temperature: number | null; humidity: number | null };
export type SensorSeries = { device_key: string; label: string; is_simulated: boolean; points: SensorPoint[] };
export type SensorHistory = { hours: number; devices: SensorSeries[] };

export async function getDevices(): Promise<Device[]> {
  const res = await fetch(`${API_URL}/iot/latest`);
  if (!res.ok) throw new Error(`The server answered ${res.status} for the latest sensor readings.`);
  return res.json();
}

export async function getSensorHistory(hours: number): Promise<SensorHistory> {
  const res = await fetch(`${API_URL}/iot/history?hours=${hours}`);
  if (!res.ok) throw new Error(`The server answered ${res.status} for the sensor history.`);
  return res.json();
}

// "3 minutes ago", "2 hours ago", or a date for anything older than a day.
export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  return `on ${new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "long", timeZone: "Africa/Johannesburg" })}`;
}

/* ---------- About page ---------- */

export async function getModels(): Promise<ModelResult[]> {
  return getJson<ModelResult[]>("/models/results");
}

/* ---------- Prediction page: three ways to get today's conditions ---------- */

export type PredictionResult = Prediction & {
  source: "live" | "day" | "manual";
  actual_next_day?: number | null;
  inputs_today: Record<string, number>;
  unusual_inputs?: { factor: string; value: number; usual: number; unit: string }[];
};

export type DatasetRange = {
  city: string;
  first: string;
  last: string;
  usual: Record<string, number>;
};

export type ManualField = { key: string; label: string; unit: string; min: number; max: number };

// Limits match backend/app/predict.py (class ManualInput).
export const MANUAL_FIELDS: ManualField[] = [
  { key: "pm2_5", label: "PM2.5 today", unit: "µg/m³", min: 0, max: 500 },
  { key: "pm2_5_yesterday", label: "PM2.5 yesterday", unit: "µg/m³", min: 0, max: 500 },
  { key: "pm2_5_2_days_ago", label: "PM2.5 two days ago", unit: "µg/m³", min: 0, max: 500 },
  { key: "pm2_5_3_days_ago", label: "PM2.5 three days ago", unit: "µg/m³", min: 0, max: 500 },
  { key: "pm10", label: "Coarse particles (PM10)", unit: "µg/m³", min: 0, max: 1000 },
  { key: "nitrogen_dioxide", label: "Nitrogen dioxide", unit: "µg/m³", min: 0, max: 500 },
  { key: "ozone", label: "Ozone", unit: "µg/m³", min: 0, max: 500 },
  { key: "temperature_2m", label: "Temperature", unit: "°C", min: -30, max: 55 },
  { key: "relative_humidity_2m", label: "Humidity", unit: "%", min: 0, max: 100 },
  { key: "wind_speed_10m", label: "Wind speed", unit: "km/h", min: 0, max: 200 },
  { key: "precipitation", label: "Rain", unit: "mm", min: 0, max: 300 },
  { key: "surface_pressure", label: "Air pressure", unit: "hPa", min: 600, max: 1100 },
];

// Everything typed into the form is kept as text until the moment of predicting.
export type ManualValues = Record<string, string>;

// Turns the server's error body into a sentence a person can act on.
async function readError(res: Response): Promise<string> {
  let detail = `The server answered with status ${res.status}.`;
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") {
      detail = body.detail;
    } else if (Array.isArray(body?.detail)) {
      detail = body.detail
        .map((d: { loc?: string[]; type?: string; msg?: string; ctx?: { le?: number; ge?: number } }) => {
          const key = d.loc?.[d.loc.length - 1] ?? "";
          const label = key === "date" ? "Date" : (MANUAL_FIELDS.find((f) => f.key === key)?.label ?? key);
          if (d.type === "missing") return `${label} is needed.`;
          if (d.type === "less_than_equal") return `${label} can be at most ${d.ctx?.le}.`;
          if (d.type === "greater_than_equal") return `${label} must be at least ${d.ctx?.ge}.`;
          return `${label}: ${d.msg ?? "not valid"}.`;
        })
        .join(" ");
    }
  } catch {
    /* keep the default message */
  }
  return detail;
}

async function readPrediction(res: Response): Promise<PredictionResult> {
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function getLive(city: string): Promise<PredictionResult> {
  return readPrediction(await fetch(`${API_URL}/predict/${city}`));
}

export async function getDay(city: string, date: string): Promise<PredictionResult> {
  return readPrediction(await fetch(`${API_URL}/predict/${city}/day?date=${encodeURIComponent(date)}`));
}

export async function getRange(city: string): Promise<DatasetRange> {
  const res = await fetch(`${API_URL}/predict/${city}/dates`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function postManual(city: string, values: ManualValues): Promise<PredictionResult> {
  if (!values.date) throw new Error("Pick the date these values are for.");
  const body: Record<string, string | number> = { date: values.date };
  for (const f of MANUAL_FIELDS) {
    const text = (values[f.key] ?? "").trim();
    if (text === "" || Number.isNaN(Number(text))) {
      throw new Error(`${f.label} needs a number. Fill in every box, or press “Start from today’s values”.`);
    }
    body[f.key] = Number(text);
  }
  return readPrediction(
    await fetch(`${API_URL}/predict/${city}/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

// Fills the manual form from a live result: today's values and the three days before.
export function manualFromLive(p: PredictionResult): ManualValues {
  const v: ManualValues = { date: p.based_on_date };
  for (const f of MANUAL_FIELDS) {
    if (f.key in p.inputs_today) v[f.key] = String(p.inputs_today[f.key]);
  }
  const days = p.recent_days;
  const earlier = (n: number) => {
    const x = days[days.length - 1 - n]?.pm2_5;
    return x === null || x === undefined ? "" : String(x);
  };
  v.pm2_5_yesterday = earlier(1);
  v.pm2_5_2_days_ago = earlier(2);
  v.pm2_5_3_days_ago = earlier(3);
  return v;
}

// Today's date in South Africa as "2026-10-18" (called only from button clicks).
export function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
}