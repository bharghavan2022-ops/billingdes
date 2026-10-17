import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BillingProvider } from "@/components/billing-provider";
import { loadOrSeed } from "@/lib/billing/server";
import { signOut } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const loaded = await loadOrSeed();
  if (!loaded.ok) {
    if (loaded.signedOut) redirect("/login");
    return (
      <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 16 }}>
        <div className="card" style={{ width: "min(560px,100%)", margin: 0 }}>
          <h1 style={{ marginBottom: 8 }}>{loaded.title}</h1>
          {loaded.detail && <div className="err">{loaded.detail}</div>}
          <p style={{ marginTop: 0 }}><b>How to fix:</b> {loaded.fix}</p>
          <form action={signOut}><button className="btn" type="submit">Sign out</button></form>
        </div>
      </main>
    );
  }
  return (
    <BillingProvider initial={loaded.data} email={loaded.email}>
      <AppShell>{children}</AppShell>
    </BillingProvider>
  );
}
