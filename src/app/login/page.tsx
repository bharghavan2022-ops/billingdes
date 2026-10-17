"use client";

import { useFormState, useFormStatus } from "react-dom";
import { signIn, signUp, type AuthResult } from "@/app/actions";

const initial: AuthResult = {};

function Buttons({ signInAction, signUpAction }: { signInAction: (fd: FormData) => void; signUpAction: (fd: FormData) => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="row">
      <button className="btn primary" type="submit" formAction={signInAction} disabled={pending}>Sign in</button>
      <button className="btn" type="submit" formAction={signUpAction} disabled={pending}>Create account</button>
    </div>
  );
}

export default function LoginPage() {
  const [inState, inAction] = useFormState(signIn, initial);
  const [upState, upAction] = useFormState(signUp, initial);
  const state = upState.error || upState.notice ? upState : inState;
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 16 }}>
      <form className="card" style={{ width: "min(380px,100%)", margin: 0 }}>
        <h1 style={{ marginBottom: 6 }}>Billing Desk</h1>
        <div className="small muted" style={{ marginBottom: 14 }}>Sign in to keep your bills in the cloud and use them on any device.</div>
        <div className="f" style={{ marginBottom: 10 }}><label htmlFor="email">Email</label><input className="inp" id="email" name="email" type="email" autoComplete="email" required /></div>
        <div className="f" style={{ marginBottom: 10 }}><label htmlFor="password">Password (min 6 characters)</label><input className="inp" id="password" name="password" type="password" autoComplete="current-password" minLength={6} required /></div>
        {state.error && <div className="err">{state.error}</div>}
        {state.notice && <div className="note"><span>{state.notice}</span></div>}
        <Buttons signInAction={inAction} signUpAction={upAction} />
      </form>
    </main>
  );
}
