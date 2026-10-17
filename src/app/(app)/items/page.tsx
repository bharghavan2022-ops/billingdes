"use client";

import { useState } from "react";
import { useBilling } from "@/components/billing-provider";
import { AdjustDialog, HistoryDialog, ItemDialog } from "@/components/item-dialogs";
import { dmy, money, todayISO, trimNum } from "@/lib/billing/calc";
import { MOVE_LABEL } from "@/lib/billing/constants";
import { addCatalogueItems, isLow, itemById } from "@/lib/billing/data";
import { CATALOGUE_SIZE } from "@/lib/billing/catalogue";
import { download, stockCsv } from "@/lib/billing/export";

const CATALOGUE_LOADED = (db: { items: { code: string }[] }) => db.items.some((i) => i.code === "001");

type Dlg = { kind: "edit"; id: string | null } | { kind: "adjust" | "hist"; id: string } | null;

export default function ItemsPage() {
  const { db, update, toast } = useBilling();
  const [tab, setTab] = useState<"items" | "moves">("items");
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [dlg, setDlg] = useState<Dlg>(null);
  const ql = q.trim().toLowerCase();

  let list = db.items.filter((i) => !ql || (i.code + " " + i.name + " " + i.alt + " " + i.hsn).toLowerCase().includes(ql));
  if (lowOnly) list = list.filter(isLow);
  list = [...list].sort((a, b) => Number(b.active) - Number(a.active) || (a.code || "").localeCompare(b.code || "") || a.name.localeCompare(b.name));
  const moves = [...db.ledger].reverse().filter((m) => !ql || (m.name + " " + m.ref + " " + m.note + " " + (MOVE_LABEL[m.type] || "")).toLowerCase().includes(ql)).slice(0, 300);

  return (
    <>
      <div className="ph"><h1>Items and stock</h1><button className="btn primary" onClick={() => setDlg({ kind: "edit", id: null })}>＋ Add item</button></div>
      {!CATALOGUE_LOADED(db) && (
        <div className="note">
          <span><b>Standard item list ({CATALOGUE_SIZE} items, codes 001–{CATALOGUE_SIZE}).</b> Load the names once; you add stock, unit and rate yourself. Items you add later continue from {String(CATALOGUE_SIZE + 1)}.</span>
          <button className="btn sm primary" onClick={() => { let r = { added: 0, linked: 0 }; update((d) => { r = addCatalogueItems(d); }); toast(r.added || r.linked ? `${r.added} items added${r.linked ? `, ${r.linked} existing linked to their codes` : ""}` : "Nothing new to add"); }}>Load {CATALOGUE_SIZE} standard items</button>
        </div>
      )}
      <div className="tabs">
        <button className={tab === "items" ? "on" : ""} onClick={() => { setTab("items"); setQ(""); }}>Items</button>
        <button className={tab === "moves" ? "on" : ""} onClick={() => { setTab("moves"); setQ(""); }}>Stock movements</button>
      </div>
      <div className="bar-tools">
        <input className="inp" placeholder={tab === "items" ? "Search items" : "Search movements"} value={q} onChange={(e) => setQ(e.target.value)} />
        {tab === "items" && (<>
          <label className="row small"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only</label>
          <span style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => download("stock-" + todayISO() + ".csv", stockCsv(db), "text/csv")}>Export stock CSV</button>
        </>)}
      </div>
      <div className="card" style={{ padding: 0 }}><div className="tw">
        {tab === "items" ? (
          list.length ? (
            <table className="tbl">
              <thead><tr><th>Code</th><th>Item</th><th>HSN</th><th className="num">Rate</th><th className="num">GST</th><th className="num">In stock</th><th></th></tr></thead>
              <tbody>{list.map((i) => (
                <tr key={i.id} style={i.active ? undefined : { opacity: 0.55 }}>
                  <td><b>{i.code}</b></td><td className="item-nm"><b>{i.name}</b><span className="small muted">{i.alt}{i.active ? "" : " · hidden from billing"}</span></td>
                  <td>{i.hsn}</td><td className="num">{money(i.rate)} / {i.unit}</td><td className="num">{trimNum(i.gst, 2)}%</td>
                  <td className="num"><b>{trimNum(i.stock, 3)}</b> {i.unit} {i.stock <= 0 ? <span className="pill out">Out</span> : i.low > 0 && i.stock <= i.low ? <span className="pill low">Low</span> : null}</td>
                  <td className="num">
                    <button className="btn sm" onClick={() => setDlg({ kind: "adjust", id: i.id })}>Adjust stock</button>{" "}
                    <button className="btn sm" onClick={() => setDlg({ kind: "hist", id: i.id })}>History</button>{" "}
                    <button className="btn sm" onClick={() => setDlg({ kind: "edit", id: i.id })}>Edit</button>
                  </td>
                </tr>))}</tbody>
            </table>
          ) : <div className="empty">No items match. Add an item to start billing.</div>
        ) : moves.length ? (
          <table className="tbl">
            <thead><tr><th>Date</th><th>Item</th><th>Type</th><th className="num">Change</th><th className="num">Balance</th><th>Reference</th></tr></thead>
            <tbody>{moves.map((m) => {
              const it = itemById(db, m.itemId);
              return (
                <tr key={m.id}><td>{dmy(m.date)}</td><td>{m.name}</td><td>{MOVE_LABEL[m.type] || m.type}</td>
                  <td className="num" style={{ color: m.qty < 0 ? "var(--bad)" : "var(--ok)" }}>{m.qty > 0 ? "+" : ""}{trimNum(m.qty, 3)}{it ? " " + it.unit : ""}</td>
                  <td className="num">{trimNum(m.bal, 3)}</td>
                  <td className="small muted">{["SALE", "EDIT", "CANCEL"].includes(m.type) ? "Bill " + m.ref + " · " : ""}{m.note}</td></tr>
              );
            })}</tbody>
          </table>
        ) : <div className="empty">No stock movements yet.</div>}
      </div></div>
      {dlg?.kind === "edit" && <ItemDialog id={dlg.id} onClose={() => setDlg(null)} />}
      {dlg?.kind === "adjust" && <AdjustDialog id={dlg.id} onClose={() => setDlg(null)} />}
      {dlg?.kind === "hist" && <HistoryDialog id={dlg.id} onClose={() => setDlg(null)} />}
    </>
  );
}
