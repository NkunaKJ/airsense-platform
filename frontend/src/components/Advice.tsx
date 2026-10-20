"use client";

import { useState } from "react";
import type { Advice as AdviceData } from "@/lib/api";

// One list of "who are you looking out for?", built from the personal profiles
// plus the parents' advice, so nothing is said twice.
function choices(advice: AdviceData): { name: string; lines: string[] }[] {
  const out = Object.entries(advice.personal).map(([name, lines]) => ({ name, lines }));
  const parents = advice.groups.find((g) => g.key === "parents");
  if (parents) {
    // Parents sit before the runner/outdoor profile so the sensitive groups come first.
    const at = out.findIndex((o) => o.name.startsWith("Runner"));
    out.splice(at === -1 ? out.length : at, 0, { name: parents.label, lines: [parents.advice] });
  }
  return out;
}

export default function Advice({ advice, bandText }: { advice: AdviceData; bandText: string }) {
  const [who, setWho] = useState<string | null>(null);
  const options = choices(advice);
  const picked = options.find((o) => o.name === who);

  return (
    <section className="section" aria-labelledby="advice-title">
      <h2 id="advice-title">Protect your health</h2>
      <p className="section__lead">
        <strong style={{ color: bandText }}>{advice.alert_level}.</strong> {advice.general}
      </p>

      <p className="advice__ask" id="advice-ask">Who are you looking out for?</p>
      <div className="city-picker" role="group" aria-labelledby="advice-ask">
        {options.map((o) => (
          <button key={o.name} aria-pressed={who === o.name} onClick={() => setWho(who === o.name ? null : o.name)}>
            {o.name}
          </button>
        ))}
      </div>
      {picked ? (
        <ul className="personal">
          {picked.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="section__fine">Choose one to see what to do for them.</p>
      )}

      <p className="section__fine">{advice.disclaimer}</p>
    </section>
  );
}