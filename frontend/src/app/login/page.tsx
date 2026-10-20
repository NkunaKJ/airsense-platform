"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { login, logout, useSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.push("/");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (session) {
    return (
      <>
        <h1 className="forecast__title">Log in</h1>
        <p className="section__lead">
          You are signed in as <strong>{session.name}</strong> ({session.email}).
        </p>
        <p>
          <Link href="/saved">Go to your saved forecasts</Link> or{" "}
          <button className="link-button" onClick={async () => { await logout(); }}>log out</button>.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="forecast__title">Log in</h1>
      <p className="section__lead">Log in to see forecasts, trends and sensors, and to save forecasts of your own.</p>

      <form className="auth" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field__label">Email</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && (
          <p className="auth__error" role="alert">
            {error}
          </p>
        )}
        <button className="predict" type="submit" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="section__fine">
        New here? <Link href="/register">Create an account</Link>.
      </p>
    </>
  );
}
