"use client";

import { useState } from "react";
import { authFetch, errorText, useSession } from "@/lib/auth";

type Result =
  | { kind: "email"; to: string; reminder: string | null }
  | { kind: "email-demo"; to: string; subject: string; text: string; reminder: string | null }
  | { kind: "sms"; to: string; text: string; reminder: string | null }
  | { kind: "error"; message: string };

const REMINDER_TIMES = ["06:00", "07:00", "08:00", "12:00", "17:00"];

// Fetch the reminder as a calendar file and hand it to the browser as a download.
async function downloadReminder(id: number, time: string) {
  const res = await authFetch(`/saved/${id}/reminder?time=${encodeURIComponent(time)}`);
  if (!res.ok) throw new Error(await errorText(res));
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = "airsense-reminder.ics";
  a.click();
  URL.revokeObjectURL(url);
}

// "Send yourself a copy?" for one saved forecast: by email (to the address on the account) or by
// SMS (demo mode: it shows the text that would be sent). Shown after a save and after a note edit.
export default function SendCopy({ id, onClose }: { id: number; onClose: () => void }) {
  const session = useSession();
  const [choosingSms, setChoosingSms] = useState(false);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [remind, setRemind] = useState(false);
  const [time, setTime] = useState("07:00");

  async function send(channel: "email" | "sms") {
    setBusy(true);
    setResult(null);
    try {
      const res = await authFetch(`/saved/${id}/send`, {
        method: "POST",
        body: JSON.stringify({ channel, phone, reminder_time: remind ? time : "" }),
      });
      if (!res.ok) throw new Error(await errorText(res));
      const out = await res.json();
      const reminder: string | null = remind ? time : null;
      if (channel === "email") {
        setResult(
          out.mode === "demo"
            ? { kind: "email-demo", to: out.to, subject: out.subject, text: out.text, reminder }
            : { kind: "email", to: out.to, reminder },
        );
      } else {
        if (remind) await downloadReminder(id, time); // SMS cannot carry a file, so the reminder downloads here
        setResult({ kind: "sms", to: out.to, text: out.text, reminder });
      }
    } catch (e) {
      setResult({
        kind: "error",
        message: e instanceof TypeError ? "We couldn’t reach the AirSense server. Try again." : (e as Error).message,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="send" role="group" aria-label="Send yourself a copy">
      <p className="send__title">Send yourself a copy?</p>
      <div className="send__choices">
        <button className="send__choice" disabled={busy} onClick={() => send("email")}>
          Email me{session ? ` at ${session.email}` : ""}
        </button>
        <button className="send__choice" disabled={busy} onClick={() => setChoosingSms((v) => !v)} aria-expanded={choosingSms}>
          SMS to my phone
        </button>
        <button className="link-button" onClick={onClose}>
          No thanks
        </button>
      </div>

      <div className="send__remind">
        <label className="send__check">
          <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
          Also set a reminder on my phone
        </label>
        {remind && (
          <>
            <label className="send__time">
              <span>on the day of the forecast, at</span>
              <select value={time} onChange={(e) => setTime(e.target.value)}>
                {REMINDER_TIMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <p className="send__help">
              By email the reminder is attached. By SMS it downloads here. Open the file on your phone and tap{" "}
              <strong>Add to calendar</strong>.
            </p>
          </>
        )}
      </div>

      {choosingSms && (
        <form
          className="send__sms"
          onSubmit={(e) => {
            e.preventDefault();
            void send("sms");
          }}
        >
          <label className="field">
            <span className="field__label">
              Cell number <span className="field__unit">South African mobile, for example 082 123 4567</span>
            </span>
            <input type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <button className="predict" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send SMS"}
          </button>
        </form>
      )}

      {result?.kind === "email" && (
        <p className="send__ok" role="status">
          Sent to {result.to}.{result.reminder && ` A calendar reminder for ${result.reminder} is attached.`} If you do not
          see it, check your spam folder.
        </p>
      )}
      {result?.kind === "email-demo" && (
        <div className="send__ok" role="status">
          <p>
            <strong>Email demo:</strong> nothing was sent. This is the email that would go to {result.to}:
          </p>
          <p className="send__sms-text">
            <strong>{result.subject}</strong>
            {"\n\n"}
            {result.text}
            {result.reminder && `\n\n[Attached: airsense-reminder.ics, a calendar reminder for ${result.reminder}]`}
          </p>
        </div>
      )}
      {result?.kind === "sms" && (
        <div className="send__ok" role="status">
          <p>
            <strong>SMS demo:</strong> nothing was sent and your number was not kept. This is the text that would go to{" "}
            {result.to}:
          </p>
          <p className="send__sms-text">{result.text}</p>
          {result.reminder && (
            <p>
              A reminder file for {result.reminder} was downloaded. Open it on your phone and tap <strong>Add to calendar</strong>.
            </p>
          )}
        </div>
      )}
      {result?.kind === "error" && (
        <p className="auth__error" role="alert">
          {result.message}
        </p>
      )}
    </div>
  );
}