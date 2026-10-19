import { FEATURE_LABELS } from "@/lib/api";

export default function CorrChart({ rows }: { rows: { feature: string; r: number | null }[] }) {
  const items = rows
    .filter((d): d is { feature: string; r: number } => d.r !== null)
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const biggest = Math.max(...items.map((d) => Math.abs(d.r)), 0.1);

  return (
    <ul className="drivers">
      {items.map((d) => {
        const up = d.r > 0;
        const width = (Math.abs(d.r) / biggest) * 38;
        return (
          <li key={d.feature} className="driver">
            <div className="driver__label">
              <span className="driver__name">{FEATURE_LABELS[d.feature] ?? d.feature}</span>
            </div>
            <div className="driver__track" role="img" aria-label={`${FEATURE_LABELS[d.feature] ?? d.feature}: r = ${d.r.toFixed(2)}`}>
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
                {Math.abs(d.r).toFixed(2)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}