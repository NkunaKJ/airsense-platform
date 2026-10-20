import { fullDate, MANUAL_FIELDS, type DatasetRange, type ManualValues } from "@/lib/api";

export type Mode = "today" | "day" | "manual";

const MODES: { key: Mode; name: string; hint: string }[] = [
  { key: "today", name: "Use today’s data", hint: "Live air and weather for the city" },
  { key: "day", name: "Pick a day from the dataset", hint: "A recorded day, so you can see what happened next" },
  { key: "manual", name: "Enter values manually", hint: "Try your own numbers" },
];

type Props = {
  mode: Mode | null;
  hasCity: boolean;
  onMode: (m: Mode) => void;
  range: DatasetRange | null;
  rangeFailed: boolean;
  date: string;
  dateOk: boolean;
  onDate: (d: string) => void;
  manual: ManualValues;
  onManual: (key: string, value: string) => void;
  onFill: () => void;
  filling: boolean;
  fillError: string | null;
  busy: boolean;
  onPredict: () => void;
};

export default function ConditionsPicker(p: Props) {
  const canPredict = !p.busy && p.hasCity && p.mode !== null && (p.mode !== "day" || p.dateOk);

  return (
    <fieldset className="inputs">
      <legend className="inputs__legend">Then choose how to get today&rsquo;s conditions</legend>

      <div className="modes">
        {MODES.map((m) => (
          <label key={m.key} className="mode">
            <input
              type="radio"
              name="conditions-mode"
              checked={p.mode === m.key}
              onChange={() => p.onMode(m.key)}
            />
            <span className="mode__name">{m.name}</span>
            <span className="mode__hint">{m.hint}</span>
          </label>
        ))}
      </div>

      {p.mode !== null && (
      <div className="inputs__panel">
        {p.mode === "today" && (
          <p>
            We fetch today&rsquo;s air and weather for the city from the internet, then predict tomorrow.
          </p>
        )}

        {p.mode === "day" && (
          <>
            {p.rangeFailed && (
              <p>We couldn&rsquo;t load the list of days. Check that the AirSense server is running.</p>
            )}
            {!p.rangeFailed && !p.range && <p className="loading">Loading the available days&hellip;</p>}
            {p.range && (
              <>
                <label className="field field--date">
                  <span className="field__label">Day to start from</span>
                  <input
                    type="date"
                    value={p.date}
                    min={p.range.first}
                    max={p.range.last}
                    onChange={(e) => p.onDate(e.target.value)}
                  />
                </label>
                <p className="inputs__help">
                  Choose any day from {fullDate(p.range.first)} to {fullDate(p.range.last)}. We predict the day
                  after it and, when that day is stored, show what really happened.
                </p>
                {!p.dateOk && (
                  <p className="inputs__help inputs__help--warn" role="alert">
                    That day is outside the available range.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {p.mode === "manual" && (
          <>
            <p>
              Type in a day&rsquo;s conditions. The model also uses the PM2.5 of the three days before, and the
              time of year from the date.
            </p>
            <p>
              <button type="button" className="link-button" onClick={p.onFill} disabled={p.filling}>
                {p.filling ? "Fetching today’s values…" : "Start from today’s values"}
              </button>{" "}
              <span className="inputs__help">to fill the boxes, then change any of them.</span>
            </p>
            {p.fillError && (
              <p className="inputs__help inputs__help--warn" role="alert">
                {p.fillError}
              </p>
            )}
            <div className="fields">
              <label className="field">
                <span className="field__label">Date these values are for</span>
                <input
                  type="date"
                  value={p.manual.date ?? ""}
                  onChange={(e) => p.onManual("date", e.target.value)}
                />
              </label>
              {MANUAL_FIELDS.map((f) => (
                <label key={f.key} className="field">
                  <span className="field__label">
                    {f.label} <span className="field__unit">({f.unit})</span>
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={f.min}
                    max={f.max}
                    value={p.manual[f.key] ?? ""}
                    placeholder={p.range && f.key in p.range.usual ? `usual ${p.range.usual[f.key]}` : ""}
                    onChange={(e) => p.onManual(f.key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </>
        )}
      </div>
      )}

      <button type="button" className="predict" onClick={p.onPredict} disabled={!canPredict}>
        {p.busy ? "Predicting…" : "Predict"}
      </button>
    </fieldset>
  );
}