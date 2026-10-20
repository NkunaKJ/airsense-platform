"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import SendCopy from "@/components/SendCopy";
import { BANDS, fullDate } from "@/lib/api";
import { authFetch, errorText, useSession } from "@/lib/auth";
import { METHOD_LABEL, NOTE_MAX, type SavedForecast } from "@/lib/saved";

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; items: SavedForecast[] };

export default function SavedPage() {
  const session = useSession();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<number | null>(null);
  const [sending, setSending] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const token = session?.token;

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch("/saved");
      if (!res.ok) throw new Error(await errorText(res));
      setLoad({ state: "ready", items: await res.json() });
    } catch (e) {
      setLoad({ state: "error", message: e instanceof TypeError ? "We couldn’t reach the AirSense server." : (e as Error).message });
    }
  }, []);

  useEffect(() => {
    if (token) void refresh();
  }, [token, refresh]);

  if (!session) {
    return (
      <>
        <h1 className="forecast__title">My forecasts</h1>
        <p className="section__lead">
          <Link href="/login">Log in</Link> to see the forecasts you saved, or <Link href="/register">create an account</Link>{" "}
          to start saving them.
        </p>
      </>
    );
  }

  async function saveNote(id: number) {
    setMessage(null);
    const res = await authFetch(`/saved/${id}`, { method: "PATCH", body: JSON.stringify({ note: draft }) });
    if (!res.ok) return setMessage(await errorText(res));
    setEditing(null);
    setSending(id); // offer a copy of the updated forecast
    setMessage("Note updated.");
    await refresh();
  }

  async function remove(id: number) {
    setMessage(null);
    const res = await authFetch(`/saved/${id}`, { method: "DELETE" });
    if (!res.ok) return setMessage(await errorText(res));
    setConfirming(null);
    setMessage("Forecast deleted.");
    await refresh();
  }

  async function download() {
    setMessage(null);
    const res = await authFetch("/saved/export");
    if (!res.ok) return setMessage(await errorText(res));
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "airsense-saved-forecasts.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const items = load.state === "ready" ? load.items : [];

  return (
    <>
      <h1 className="forecast__title">My forecasts</h1>
      <p className="section__lead">The forecasts you saved. Only you can see this list.</p>

      {load.state === "loading" && <p className="loading">Loading your forecasts…</p>}
      {load.state === "error" && (
        <div className="notice" role="alert">
          <strong>We couldn’t load your forecasts.</strong>
          <p>{load.message}</p>
          <button onClick={() => void refresh()}>Try again</button>
        </div>
      )}
      {message && (
        <p className="saved__message" role="status">
          {message}
        </p>
      )}

      {load.state === "ready" && items.length === 0 && (
        <p className="section__lead">
          You have not saved a forecast yet. Make one on the <Link href="/">Prediction</Link> page and press{" "}
          <strong>Save this forecast</strong>.
        </p>
      )}

      {items.length > 0 && (
        <>
          <p>
            <button className="predict" onClick={download}>
              Download as CSV
            </button>
          </p>
          <ul className="saved">
            {items.map((f) => {
              const colour = BANDS.find((b) => b.name === f.band)?.text;
              return (
                <li key={f.id} className="saved__item">
                  <div className="saved__head">
                    <strong>{f.city_name}</strong>
                    <span>for {fullDate(f.predicts_for_date)}</span>
                  </div>
                  <p className="saved__reading">
                    <span className="saved__value">{Math.round(f.predicted_pm2_5)}</span> µg/m³ of PM2.5,{" "}
                    <strong style={{ color: colour }}>{f.band}</strong>
                  </p>
                  <p className="saved__meta">
                    {METHOD_LABEL[f.source]}, based on {fullDate(f.based_on_date)}. Typically off by about{" "}
                    {Math.round(f.typical_error)} µg/m³.
                  </p>

                  {editing === f.id ? (
                    <div className="saved__edit">
                      <label className="field">
                        <span className="field__label">Note</span>
                        <input type="text" maxLength={NOTE_MAX} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
                      </label>
                      <button className="predict" onClick={() => saveNote(f.id)}>
                        Save note
                      </button>
                      <button className="link-button" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <p className="saved__note">{f.note ? <>Note: {f.note}</> : <em>No note</em>}</p>
                  )}

                  {editing !== f.id && (
                    <div className="saved__actions">
                      <button
                        className="link-button"
                        onClick={() => {
                          setEditing(f.id);
                          setDraft(f.note);
                          setConfirming(null);
                        }}
                      >
                        Edit note
                      </button>
                      <button className="link-button" onClick={() => setSending(sending === f.id ? null : f.id)}>
                        Send a copy
                      </button>
                      {confirming === f.id ? (
                        <>
                          <span>Delete this forecast?</span>
                          <button className="link-button saved__danger" onClick={() => remove(f.id)}>
                            Yes, delete
                          </button>
                          <button className="link-button" onClick={() => setConfirming(null)}>
                            Keep it
                          </button>
                        </>
                      ) : (
                        <button className="link-button saved__danger" onClick={() => setConfirming(f.id)}>
                          Delete
                        </button>
                      )}
                    </div>
                  )}

                  {sending === f.id && <SendCopy key={`${f.id}-${f.note}`} id={f.id} onClose={() => setSending(null)} />}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
