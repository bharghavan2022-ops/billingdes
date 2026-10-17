"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { authenticate, type AuthResult } from "@/app/actions";

const initial: AuthResult = {};

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

function Buttons() {
  const { pending } = useFormStatus();
  return (
    <div className="row">
      <button className="btn primary" type="submit" name="intent" value="signin" disabled={pending}>{pending ? "Please wait…" : "Sign in"}</button>
      <button className="btn" type="submit" name="intent" value="signup" disabled={pending}>Create account</button>
    </div>
  );
}

export default function LoginPage() {
  const [state, action] = useFormState(authenticate, initial);
  // Controlled inputs keep what you typed after a failed attempt.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);

  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 16 }}>
      <form action={action} className="card" style={{ width: "min(380px,100%)", margin: 0 }}>
        <h1 style={{ marginBottom: 6 }}>Billing Desk</h1>
        <div className="small muted" style={{ marginBottom: 14 }}>Sign in, or create an account the first time. Your bills are saved to your account and work on any device.</div>
        <div className="f" style={{ marginBottom: 10 }}>
          <label htmlFor="email">Email</label>
          <input className="inp" id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="f" style={{ marginBottom: 12 }}>
          <label htmlFor="password">Password (at least 6 characters)</label>
          <div style={{ position: "relative" }}>
            <input className="inp" id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: 44 }} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} title={show ? "Hide password" : "Show password"}
              style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 36, height: 36, display: "grid", placeItems: "center", border: 0, borderRadius: 8, background: "transparent", color: "var(--muted)" }}>
              <EyeIcon off={show} />
            </button>
          </div>
        </div>
        <div aria-live="polite">
          {state.error && <div className="err">{state.error}</div>}
          {state.notice && <div className="note"><span>{state.notice}</span></div>}
        </div>
        <Buttons />
      </form>
    </main>
  );
}
