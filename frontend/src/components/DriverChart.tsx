import type { Explanation } from "@/lib/api";

const MIN_SHOWN = 0.5; // effects smaller than this (in µg/m³) are left out of the chart

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function DriverChart({
  explanation,
  predicted,
}: {
  explanation: Explanation;
  predicted: number;
}) {
  const shown = explanation.drivers.filter((d) => Math.abs(d.effect) >= MIN_SHOWN);
  const hidden = explanation.drivers.length - shown.length;
  const biggest = Math.max(...shown.map((d) => Math.abs(d.effect)), 1);

  return (
    <section className="section" aria-labelledby="why-title">
      <h2 id="why-title">Why this number</h2>
      <p className="section__lead">
        A typical day in the training data comes out at{" "}
        <strong>{fmt(explanation.typical_day_prediction)} µg/m³</strong>. Today&rsquo;s weather
        and air move tomorrow&rsquo;s forecast to <strong>{fmt(Math.round(predicted * 10) / 10)}</strong>.
        Bars to the right push it up. Bars to the left pull it down.
      </p>

      <ul className="drivers">
        {shown.map((d) => {
          const width = (Math.abs(d.effect) / biggest) * 38;
          const up = d.effect > 0;
          return (
            <li key={d.factor} className="driver">
              <div className="driver__label">
                <span className="driver__name">{d.factor}</span>
                {d.today !== undefined && d.usual !== undefined && (
                  <span className="driver__detail">
                    {fmt(d.today)} {d.unit} today, {fmt(d.usual)} usual
                  </span>
                )}
              </div>
              <div
                className="driver__track"
                role="img"
                aria-label={`${d.factor} ${up ? "raises" : "lowers"} tomorrow by ${fmt(Math.abs(d.effect))}`}
              >
                <span className="driver__axis" />
                <span
                  className={`driver__bar ${up ? "driver__bar--up" : "driver__bar--down"}`}
                  style={up ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }}
                />
                <span
                  className="driver__value"
                  style={up ? { left: `calc(50% + ${width}% + 0.4rem)` } : { right: `calc(50% + ${width}% + 0.4rem)` }}
                >
                  {up ? "+" : "\u2212"}
                  {fmt(Math.abs(d.effect))}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="section__fine">
        Effects are in µg/m³. {hidden > 0 && `${hidden} smaller factors (each under ${MIN_SHOWN}) are left out. `}
        {explanation.method === "exact"
          ? "For this model the effects are exact."
          : "For this model the effects are an approximation, so the bars may not add up exactly to the difference."}
      </p>
    </section>
  );
}