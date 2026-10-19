import type { Candidate } from "@/lib/api";

export default function CandidateBars({ candidates }: { candidates: Candidate[] }) {
  const rows = candidates
    .filter((c) => c.cv_mae !== null)
    .sort((a, b) => (a.cv_mae as number) - (b.cv_mae as number));
  const top = Math.max(...rows.map((c) => c.cv_mae as number), 1);

  return (
    <ul className="cands">
      {rows.map((c) => {
        const baseline = c.model_name.toLowerCase().startsWith("baseline");
        return (
          <li key={c.model_name} className="cand">
            <span className="cand__name">
              {c.model_name}
              {c.is_selected && <strong className="cand__tag">Chosen</strong>}
            </span>
            <span className="cand__track">
              <span
                className={`cand__bar${c.is_selected ? " cand__bar--chosen" : baseline ? " cand__bar--base" : ""}`}
                style={{ width: `${((c.cv_mae as number) / top) * 100}%` }}
              />
            </span>
            <span className="cand__value">{(c.cv_mae as number).toFixed(2)}</span>
          </li>
        );
      })}
    </ul>
  );
}