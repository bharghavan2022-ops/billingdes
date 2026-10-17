"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 16 }}>
      <div className="card" style={{ width: "min(520px,100%)", margin: 0 }}>
        <h1 style={{ marginBottom: 8 }}>Something went wrong</h1>
        <p className="muted" style={{ marginTop: 0 }}>Your saved data is safe. Try again, and if it keeps happening, send this code to support{error.digest ? `: ${error.digest}` : "."}</p>
        <div className="row"><button className="btn primary" onClick={reset}>Try again</button><a className="btn" href="/">Go to Home</a></div>
      </div>
    </main>
  );
}
