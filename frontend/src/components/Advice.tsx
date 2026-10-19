"use client";

import { useState } from "react";
import type { Advice as AdviceData } from "@/lib/api";

export default function Advice({ advice, bandText }: { advice: AdviceData; bandText: string }) {
  const [profile, setProfile] = useState<string | null>(null);
  const profiles = Object.keys(advice.personal);

  return (
    <section className="section" aria-labelledby="advice-title">
      <h2 id="advice-title">What to do</h2>
      <p className="section__lead">
        <strong style={{ color: bandText }}>{advice.alert_level}.</strong> {advice.general}
      </p>

      <dl className="groups">
        {advice.groups.map((g) => (
          <div key={g.key} className="group">
            <dt>{g.label}</dt>
            <dd>{g.advice}</dd>
          </div>
        ))}
      </dl>

      <h3 className="section__sub">Advice for you</h3>
      <div className="city-picker" role="group" aria-label="Choose what applies to you">
        {profiles.map((p) => (
          <button key={p} aria-pressed={profile === p} onClick={() => setProfile(profile === p ? null : p)}>
            {p}
          </button>
        ))}
      </div>
      {profile && (
        <ul className="personal">
          {advice.personal[profile].map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      <p className="section__fine">{advice.disclaimer}</p>
    </section>
  );
}