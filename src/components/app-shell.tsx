"use client";

import { TamilKeyboard } from "./tamil-keyboard";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { signOut } from "@/app/actions";
import { Icon } from "./icons";
import { useBilling } from "./billing-provider";
import { activeSeller } from "@/lib/billing/data";

const NAV: [string, string, string][] = [
  ["/", "dashboard", "Home"], ["/new", "new", "New bill"], ["/invoices", "invoices", "Invoices"],
  ["/items", "items", "Items"], ["/customers", "customers", "Customers"], ["/past-bills", "past-bills", "Past bills"], ["/settings", "settings", "Settings"],
];

function activeKey(path: string) {
  if (path === "/") return "dashboard";
  const first = path.split("/")[1];
  if (first === "edit" || first === "copy") return "new";
  return first;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { db, update, saveState, saveError, email, retry, backup, recovered, restoreRecovered, discardRecovered } = useBilling();
  const path = usePathname();
  const active = activeKey(path);
  const seller = activeSeller(db);
  const name = seller.biz.name || "Billing Desk";
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => { document.title = name; }, [name]);

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><b>{name}</b><span>Billing</span></div>
        <nav className="nav">
          {NAV.map(([href, key, label]) => (
            <Link key={key} href={href} className={key === active ? "on" : ""}><Icon name={key} /><span>{label}</span></Link>
          ))}
        </nav>
        <div className="foot">
          {saveState === "error" ? <span style={{ color: "var(--bad)" }}>Not saved: {saveError}</span> : saveState === "saving" ? "Saving…" : "All changes saved"}
          <br />{email}
          <div className="small" style={{ marginTop: 6, opacity: 0.8 }}>Version {process.env.NEXT_PUBLIC_BUILD_ID}</div>
          <form action={signOut} style={{ display: "inline" }}> · <button className="lnk" type="submit">Sign out</button></form>
        </div>
      </aside>
      <main>
        {mounted && saveState === "error" && (
          <div className="err" role="alert" style={{ marginBottom: 12 }}>
            <b>Your latest bills are NOT saved yet.</b> {saveError}
            <div className="row" style={{ marginTop: 8, gap: 8 }}>
              <button className="btn sm primary" onClick={retry}>Retry now</button>
              <button className="btn sm" onClick={backup}>Download a backup of everything</button>
            </div>
            <div className="small" style={{ marginTop: 6 }}>Keep this page open until it says &ldquo;All changes saved&rdquo;. A copy is also kept in this browser.</div>
          </div>
        )}
        {mounted && recovered && (
          <div className="note" role="alert" style={{ marginBottom: 12 }}>
            <span><b>Found {recovered.bills > 0 ? `${recovered.bills} bill${recovered.bills === 1 ? "" : "s"}` : "unsaved work"} from your last visit that never reached the database.</b> Restore them and they will be saved now.</span>
            <span className="row" style={{ gap: 8 }}><button className="btn sm primary" onClick={restoreRecovered}>Restore and save</button><button className="btn sm" onClick={discardRecovered}>Discard</button></span>
          </div>
        )}
        {mounted && db.settings.sellers.length > 1 && (
          <div className="sellerbar" role="group" aria-label="Bill from">
            <span className="lbl">Bill from</span>
            {db.settings.sellers.map((s) => (
              <button key={s.id} type="button" className={s.id === seller.id ? "on" : ""} aria-pressed={s.id === seller.id}
                onClick={() => { if (s.id !== seller.id) update((d) => { d.settings.sellerId = s.id; }); }}>
                {s.biz.name || "Business"}
              </button>
            ))}
          </div>
        )}
        {mounted ? children : null}
        <TamilKeyboard />
      </main>
      <datalist id="gstList">{["0", "0.25", "3", "5", "12", "18", "28", "40"].map((g) => <option key={g} value={g} />)}</datalist>
      <datalist id="unitList">{["KGS", "GMS", "NOS", "PCS", "LTR", "MTR", "BOX", "PKT", "DOZ", "BAG", "BDL"].map((u) => <option key={u} value={u} />)}</datalist>
    </div>
  );
}
