"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useBilling } from "@/components/billing-provider";
import { StatusPill } from "@/components/pill";
import { dmy, invPaid, invStatus, money, round2, todayISO } from "@/lib/billing/calc";
import { STATUS_LABEL } from "@/lib/billing/constants";
import { sellerOfInvoice } from "@/lib/billing/data";
import { download, invoicesCsv } from "@/lib/billing/export";

export default function InvoicesPage() {
  const { db } = useBilling();
  const router = useRouter();
  const [q, setQ] = useState(""), [st, setSt] = useState(""), [from, setFrom] = useState(""), [to, setTo] = useState(""), [by, setBy] = useState("");
  const t = todayISO(), ql = q.trim().toLowerCase();
  const list = db.invoices
    .filter((i) => (!ql || (i.no + " " + i.cust.name).toLowerCase().includes(ql)) && (!st || invStatus(i, t) === st) && (!from || i.date >= from) && (!to || i.date <= to) && (!by || sellerOfInvoice(db.settings, i).id === by))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const act = list.filter((i) => i.status !== "cancelled");
  const tg = round2(act.reduce((s, i) => s + i.grand, 0)), tp = round2(act.reduce((s, i) => s + invPaid(i), 0));

  return (
    <>
      <div className="ph"><h1>Invoices</h1><div className="row">
        <button className="btn" onClick={() => download("invoices-" + todayISO() + ".csv", invoicesCsv(db), "text/csv")}>Export CSV</button>
        <Link className="btn primary" href="/new">＋ New bill</Link></div></div>
      <div className="bar-tools">
        <input className="inp" placeholder="Search number or customer" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="inp" value={st} onChange={(e) => setSt(e.target.value)}>
          <option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {db.settings.sellers.length > 1 && (
          <select className="inp" aria-label="Issued by" value={by} onChange={(e) => setBy(e.target.value)}>
            <option value="">All firms</option>{db.settings.sellers.map((x) => <option key={x.id} value={x.id}>{x.biz.name}</option>)}
          </select>
        )}
        <label className="row small">From <input className="inp sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="row small">To <input className="inp sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <div className="card" style={{ padding: 0 }}><div className="tw">
        {list.length ? (
          <table className="tbl">
            <thead><tr><th>No.</th><th>Date</th><th>Issued by</th><th>Customer</th><th className="num">Amount</th><th className="num">Received</th><th className="num">Balance</th><th>Status</th></tr></thead>
            <tbody>{list.map((i) => {
              const s = invStatus(i, t), p = invPaid(i);
              return (
                <tr key={i.id} className="click" onClick={() => router.push("/invoices/" + i.id)}>
                  <td><b>{i.no}</b></td><td>{dmy(i.date)}</td><td className="small">{sellerOfInvoice(db.settings, i).biz.name}</td><td>{i.cust.name}</td><td className="num">{money(i.grand)}</td><td className="num">{money(p)}</td>
                  <td className="num">{i.status === "cancelled" ? "–" : money(Math.max(0, round2(i.grand - p)))}</td><td><StatusPill st={s} /></td>
                </tr>
              );
            })}</tbody>
            <tfoot><tr><td colSpan={4}>{act.length} active bill{act.length === 1 ? "" : "s"}</td><td className="num">{money(tg)}</td><td className="num">{money(tp)}</td><td className="num">{money(Math.max(0, round2(tg - tp)))}</td><td></td></tr></tfoot>
          </table>
        ) : <div className="empty">No bills found.</div>}
      </div></div>
    </>
  );
}
