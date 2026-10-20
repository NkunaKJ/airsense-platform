"use client";

import Link from "next/link";
import { useState } from "react";
import type { PredictionResult } from "@/lib/api";
import { authFetch, errorText, useSession } from "@/lib/auth";
import SendCopy from "@/components/SendCopy";
import { NOTE_MAX } from "@/lib/saved";

// Under a forecast: lets a logged-in person keep it, with a short note. Visitors are pointed to log in.
// The page gives this component a new key for each forecast, so it starts fresh every time.
export default function SaveForecast({ data }: { data: PredictionResult }) {
  const session = useSession();
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [savedId, setSavedId] = useState<number | null>(null);
  const [offer, setOffer] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (!session) {
    return (
      <p className="save save--hint">
        Want to keep this forecast? <Link href="/login">Log in</Link> or <Link href="/register">create an account</Link>{" "}
        to save it.
      </p>
    );
  }

  if (state === "saved") {
    return (
      <>
        <p className="save save--done" role="status">
          Saved. You can find it, edit its note or delete it in <Link href="/saved">My forecasts</Link>.
        </p>
        {offer && savedId !== null && <SendCopy id={savedId} onClose={() => setOffer(false)} />}
      </>
    );
  }

  async function save() {
    setState("saving");
    setError(null);
    try {
      const res = await authFetch("/saved", {
        method: "POST",
        body: JSON.stringify({
          city: data.city,
          source: data.source,
          based_on_date: data.based_on_date,
          predicts_for_date: data.predicts_for_date,
          predicted_pm2_5: Math.round(data.predicted_pm2_5 * 10) / 10,
          band: data.band,
          typical_error: Math.round(data.typical_error * 10) / 10,
          note,
        }),
      });
      if (!res.ok) throw new Error(await errorText(res));
      setSavedId((await res.json()).id);
      setState("saved");
    } catch (e) {
      setError(e instanceof TypeError ? "We couldn’t reach the AirSense server. Try again." : (e as Error).message);
      setState("idle");
    }
  }

  return (
    <div className="save">
      <label className="field">
        <span className="field__label">
          Add a note <span className="field__unit">optional</span>
        </span>
        <input
          type="text"
          maxLength={NOTE_MAX}
          placeholder="For example: planning the school run"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button className="predict" onClick={save} disabled={state === "saving"}>
        {state === "saving" ? "Saving…" : "Save this forecast"}
      </button>
      {error && (
        <p className="auth__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}