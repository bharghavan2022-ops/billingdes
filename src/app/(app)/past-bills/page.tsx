"use client";

import Link from "next/link";
import { useState } from "react";
import { useBilling } from "@/components/billing-provider";
import { StatusPill } from "@/components/pill";
import { dmy, invStatus, money, todayISO } from "@/lib/billing/calc";
import { sellerOfInvoice } from "@/lib/billing/data";

/** Every saved bill, newest first, with one-click duplication into a new bill. */
export default function PastBillsPage() {
  const { db } = useBilling();
  const [q, setQ] = useState("");
  const t = todayISO(), ql = q.trim().toLowerCase();
  const list = db.invoices
    .filter((i) => !ql || (i.no + " " + i.cust.name + " " + i.lines.map((l) => l.name).join(" ")).toLowerCase().includes(ql))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  return (
    <>
      <div className="ph"><h1>Past bills</h1></div>
      <div className="small muted" style={{ marginBottom: 10 }}>Pick a past bill and duplicate it to start a new bill with the same customer and items. Rates and GST are copied as they were; the invoice number, date and payments start fresh.</div>
      <div className="bar-tools"><input className="inp" placeholder="Search number, customer or item" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="card" style={{ padding: 0 }}><div className="tw">
        {list.length ? (
          <table className="tbl">
            <thead><tr><th>No.</th><th>Date</th><th>Issued by</th><th>Customer</th><th>Items</th><th className="num">Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>{list.map((i) => (
              <tr key={i.id}>
                <td><b>{i.no}</b></td><td>{dmy(i.date)}</td><td className="small">{sellerOfInvoice(db.settings, i).biz.name}</td><td>{i.cust.name}</td>
                <td className="small muted">{i.lines.length} item{i.lines.length === 1 ? "" : "s"}: {i.lines.slice(0, 2).map((l) => l.name).join(", ")}{i.lines.length > 2 ? "…" : ""}</td>
                <td className="num">{money(i.grand)}</td><td><StatusPill st={invStatus(i, t)} /></td>
                <td className="num"><Link className="btn sm" href={"/invoices/" + i.id}>View</Link>{" "}<Link className="btn sm primary" href={"/copy/" + i.id}>Duplicate</Link></td>
              </tr>
            ))}</tbody>
          </table>
        ) : <div className="empty">No past bills yet. Bills you save appear here.</div>}
      </div></div>
    </>
  );
}
