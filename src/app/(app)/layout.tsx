import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BillingProvider } from "@/components/billing-provider";
import { loadOrSeed } from "@/lib/billing/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const loaded = await loadOrSeed();
  if (!loaded) redirect("/login");
  return (
    <BillingProvider initial={loaded.data} email={loaded.email}>
      <AppShell>{children}</AppShell>
    </BillingProvider>
  );
}
