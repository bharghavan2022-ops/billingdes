"use client";

import { useState } from "react";
import { useBilling } from "@/components/billing-provider";
import { CustomerDialog } from "@/components/customer-dialog";
import { invPaid, money, round2 } from "@/lib/billing/calc";

export default function CustomersPage() {
  const { db } = useBilling();
  const [q, setQ] = useState("");
  const [dlg, setDlg] = useState<{ id: string | null } | null>(null);
  const ql = q.trim().toLowerCase();
  const list = db.customers.filter((c) => !ql || (c.name + " " + c.mobile + " " + c.gstin).toLowerCase().includes(ql)).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <div className="ph"><h1>Customers</h1><button className="btn primary" onClick={() => setDlg({ id: null })}>＋ Add customer</button></div>
      <div className="bar-tools"><input className="inp" placeholder="Search name, mobile or GSTIN" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="card" style={{ padding: 0 }}><div className="tw">
        {list.length ? (
          <table className="tbl">
            <thead><tr><th>Customer</th><th>Mobile</th><th>GSTIN</th><th className="num">To collect</th><th></th></tr></thead>
            <tbody>{list.map((c) => {
              const owed = db.invoices.filter((i) => i.custId === c.id && i.status !== "cancelled").reduce((s, i) => s + Math.max(0, round2(i.grand - invPaid(i))), 0);
              return (
                <tr key={c.id}><td className="item-nm"><b>{c.name}</b><span className="small muted">{c.address}</span></td><td>{c.mobile}</td><td>{c.gstin}</td>
                  <td className="num">{owed ? money(owed) : <span className="muted">–</span>}</td>
                  <td className="num"><button className="btn sm" onClick={() => setDlg({ id: c.id })}>Edit</button></td></tr>
              );
            })}</tbody>
          </table>
        ) : <div className="empty">No customers yet. They are added when you tick “Save to customers” on a bill, or add one here.</div>}
      </div></div>
      {dlg && <CustomerDialog id={dlg.id} onClose={() => setDlg(null)} />}
    </>
  );
}
