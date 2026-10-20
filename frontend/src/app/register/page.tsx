"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { logout, register, useSession } from "@/lib/auth";

const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function RegisterPage() {
  const router = useRouter();
  const session = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter your name.");
    if (!EMAIL_OK.test(email.trim())) return setError("Enter a valid email address, for example name@example.com.");
    if (password.length < 8) return setError("Your password needs at least 8 characters.");
    if (password !== again) return setError("The two passwords do not match.");
    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password);
      router.push("/");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (session) {
    return (
      <>
        <h1 className="forecast__title">Create an account</h1>
        <p className="section__lead">
          You are signed in as <strong>{session.name}</strong>.{" "}
          <button className="link-button" onClick={() => logout()}>Log out</button> to create a different account.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="forecast__title">Create an account</h1>
      <p className="section__lead">An account lets you see AirSense, save forecasts, add notes, and download your list.</p>

      <form className="auth" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field__label">Your name</span>
          <input type="text" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Email</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">
            Password <span className="field__unit">at least 8 characters</span>
          </span>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Type the password again</span>
          <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
        {error && (
          <p className="auth__error" role="alert">
            {error}
          </p>
        )}
        <button className="predict" type="submit" disabled={busy}>
          {busy ? "Creating your account…" : "Create account"}
        </button>
      </form>
      <p className="section__fine">
        Already have an account? <Link href="/login">Log in</Link>. Your password is never stored, only a scrambled
        version of it.
      </p>
    </>
  );
}
