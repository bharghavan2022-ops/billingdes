"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useBilling } from "@/components/billing-provider";
import { AdjustDialog } from "@/components/item-dialogs";
import { StatusPill } from "@/components/pill";
import { dmy, invPaid, invStatus, money, round2, todayISO, trimNum } from "@/lib/billing/calc";
import { isLow } from "@/lib/billing/data";
import { download } from "@/lib/billing/export";

export default function DashboardPage() {
  const { db, update, toast } = useBilling();
  const router = useRouter();
  const [adjust, setAdjust] = useState("");
  const t = todayISO(), ym = t.slice(0, 7);
  const act = db.invoices.filter((i) => i.status !== "cancelled");
  const sum = (a: typeof act) => a.reduce((s, i) => s + i.grand, 0);
  const td = act.filter((i) => i.date === t), mo = act.filter((i) => i.date.startsWith(ym));
  const owed = act.reduce((s, i) => s + Math.max(0, round2(i.grand - invPaid(i))), 0);
  const overdue = act.filter((i) => invStatus(i, t) === "overdue").length;
  const low = db.items.filter((i) => i.active && isLow(i));
  const recent = [...db.invoices].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const lb = db.meta.lastBackup, days = lb ? Math.floor((Date.now() - lb) / 864e5) : null;

  const backup = () => {
    update((d) => { d.meta.lastBackup = Date.now(); });
    download("billing-backup-" + todayISO() + ".json", JSON.stringify(db, null, 1), "application/json");
    toast("Backup downloaded");
  };
  const clearSample = () => update((d) => { d.items = []; d.customers = []; d.invoices = []; d.ledger = []; d.meta.sampleNote = false; });

  return (
    <>
      <div className="ph"><h1>Home</h1><Link className="btn primary" href="/new">＋ New bill</Link></div>
      {db.meta.sampleNote && (
        <div className="note warn">
          <span><b>Sample data loaded from your bill no. 49.</b> The stock quantities are placeholders. Set real stock in Items, and check the business and bank details in Settings.</span>
          <span className="row">
            <button className="btn sm" onClick={() => { clearSample(); toast("Sample data cleared"); }}>Clear sample data</button>
            <button className="btn sm" onClick={() => update((d) => { d.meta.sampleNote = false; })}>Keep it</button>
          </span>
        </div>
      )}
      {(lb === null || (days ?? 0) >= 7) && (
        <div className="note"><span>{lb === null ? "You have not downloaded a backup yet." : `Last backup was ${days} days ago.`} Your data is saved to your account; a backup file is an extra copy.</span><button className="btn sm" onClick={backup}>Download backup</button></div>
      )}
      <div className="stats">
        <div className="stat"><div className="k">Today&apos;s sales</div><div className="v">{money(sum(td))}</div><div className="s">{td.length} bill{td.length === 1 ? "" : "s"}</div></div>
        <div className="stat"><div className="k">This month</div><div className="v">{money(sum(mo))}</div><div className="s">{mo.length} bill{mo.length === 1 ? "" : "s"}</div></div>
        <div className="stat"><div className="k">Money to collect</div><div className="v">{money(owed)}</div><div className="s">{overdue} overdue</div></div>
        <div className="stat"><div className="k">Items to restock</div><div className="v">{low.length}</div><div className="s">low or out of stock</div></div>
      </div>
      <div className="split">
        <div className="card"><h2>Recent bills</h2>
          {recent.length ? (
            <div className="tw"><table className="tbl"><tbody>
              {recent.map((i) => (
                <tr key={i.id} className="click" onClick={() => router.push("/invoices/" + i.id)}>
                  <td><b>{i.no}</b><div className="small muted">{dmy(i.date)}</div></td>
                  <td>{i.cust.name}</td><td className="num">{money(i.grand)}</td>
                  <td><StatusPill st={invStatus(i, t)} /></td>
                </tr>
              ))}
            </tbody></table></div>
          ) : <div className="empty">No bills yet. Create your first one.</div>}
        </div>
        <div className="card"><h2>Stock to watch</h2>
          {low.length ? (
            <div className="tw"><table className="tbl"><tbody>
              {low.map((i) => (
                <tr key={i.id}>
                  <td className="item-nm"><b>{i.name}</b></td>
                  <td className="num">{trimNum(i.stock, 3)} {i.unit}</td>
                  <td><span className={`pill ${i.stock <= 0 ? "out" : "low"}`}>{i.stock <= 0 ? "Out" : "Low"}</span></td>
                  <td><button className="btn sm" onClick={() => setAdjust(i.id)}>Add stock</button></td>
                </tr>
              ))}
            </tbody></table></div>
          ) : <div className="empty">All items are above their alert level.</div>}
        </div>
      </div>
      {adjust && <AdjustDialog id={adjust} onClose={() => setAdjust("")} />}
    </>
  );
}
