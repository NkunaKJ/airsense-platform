import { bandFor, shortDate } from "@/lib/api";

type Day = { date: string; pm2_5: number | null };

// The wording changes with where the numbers came from.
const TEXT = {
  live: {
    title: "The last week",
    label: "Tomorrow",
    lead: "Daily average PM2.5 in µg/m³. The outlined bar is tomorrow’s forecast.",
    fine: "Today’s bar mixes hours already measured with the model’s forecast for the rest of today.",
  },
  day: {
    title: "The week up to that day",
    label: "Next day",
    lead: "Recorded daily average PM2.5 in µg/m³. The outlined bar is the forecast for the day after.",
    fine: null,
  },
  manual: {
    title: "The days you entered",
    label: "Next day",
    lead: "Daily average PM2.5 in µg/m³ as you typed it. The outlined bar is the forecast for the day after.",
    fine: "Only the four PM2.5 values you typed in are shown.",
  },
} as const;

export default function RecentDays({
  days,
  tomorrow,
  tomorrowDate,
  source = "live",
}: {
  days: Day[];
  tomorrow: number;
  tomorrowDate: string;
  source?: "live" | "day" | "manual";
}) {
  const text = TEXT[source];
  const top = Math.max(60, tomorrow, ...days.map((d) => d.pm2_5 ?? 0));
  const bars = [
    ...days.map((d) => ({ label: shortDate(d.date), value: d.pm2_5, forecast: false })),
    { label: shortDate(tomorrowDate), value: tomorrow, forecast: true },
  ];

  return (
    <section className="section" aria-labelledby="recent-title">
      <h2 id="recent-title">{text.title}</h2>
      <p className="section__lead">{text.lead}</p>
      <ol className="week">
        {bars.map((b) => {
          const band = b.value === null ? null : bandFor(b.value);
          return (
            <li key={b.label} className="week__day">
              <span className="week__value">{b.value === null ? "–" : Math.round(b.value)}</span>
              <span className="week__well">
                {band && b.value !== null && (
                  <span
                    className={b.forecast ? "week__bar week__bar--forecast" : "week__bar"}
                    style={{
                      height: `${(b.value / top) * 100}%`,
                      background: b.forecast ? "transparent" : band.colour,
                      borderColor: band.colour,
                    }}
                  />
                )}
              </span>
              <span className="week__label">{b.forecast ? text.label : b.label}</span>
            </li>
          );
        })}
      </ol>
      {text.fine && <p className="section__fine">{text.fine}</p>}
    </section>
  );
}