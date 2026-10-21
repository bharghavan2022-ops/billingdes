"use client";

import { useState } from "react";
import { useBilling } from "@/components/billing-provider";
import { AdjustDialog, HistoryDialog, ItemDialog } from "@/components/item-dialogs";
import { dmy, money, todayISO, trimNum } from "@/lib/billing/calc";
import { MOVE_LABEL } from "@/lib/billing/constants";
import { addCatalogueItems, applyInvoiceRates, catalogueNeedsLoading, isLow, itemById, itemsDifferingFromInvoices } from "@/lib/billing/data";
import { ConfirmDialog } from "@/components/dialog";
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
  const track = db.settings.trackStock;
  const [confirmRates, setConfirmRates] = useState(false);
  const differing = itemsDifferingFromInvoices(db).length;

  const showMoves = track && tab === "moves";
  let list = db.items.filter((i) => !ql || (i.code + " " + i.name + " " + i.alt + " " + i.hsn).toLowerCase().includes(ql));
  if (track && lowOnly) list = list.filter(isLow);
  list = [...list].sort((a, b) => Number(b.active) - Number(a.active) || (a.code || "").localeCompare(b.code || "") || a.name.localeCompare(b.name));
  const moves = [...db.ledger].reverse().filter((m) => !ql || (m.name + " " + m.ref + " " + m.note + " " + (MOVE_LABEL[m.type] || "")).toLowerCase().includes(ql)).slice(0, 300);

  return (
    <>
      <div className="ph"><h1>{track ? "Items and stock" : "Items"}</h1><button className="btn primary" onClick={() => setDlg({ kind: "edit", id: null })}>＋ Add item</button></div>
      {catalogueNeedsLoading(db) && (
        <div className="note">
          <span><b>Standard item list ({CATALOGUE_SIZE} items, codes 001–{CATALOGUE_SIZE}, with HSN and GST).</b> {CATALOGUE_LOADED(db) ? "Fill in the HSN and GST of the standard items." : "Load them once; you only set the rate yourself."} Items you add later continue from {String(CATALOGUE_SIZE + 1)}. Check the GST rates with your tax consultant.</span>
          <button className="btn sm primary" onClick={() => { let r = { added: 0, linked: 0, filled: 0 }; update((d) => { r = addCatalogueItems(d); }); toast(r.added || r.linked || r.filled ? `${r.added} items added${r.linked ? `, ${r.linked} existing linked to their codes` : ""}${r.filled ? `, HSN and GST filled for ${r.filled}` : ""}` : "Nothing new to add"); }}>{CATALOGUE_LOADED(db) ? "Fill HSN and GST" : `Load ${CATALOGUE_SIZE} standard items`}</button>
        </div>
      )}
      {!catalogueNeedsLoading(db) && differing > 0 && (
        <div className="note">
          <span><b>{differing} standard items differ from your sales invoices.</b> Update their HSN, GST, unit and default rate to the values on your invoices (items that are not on the invoices keep what they have).</span>
          <button className="btn sm primary" onClick={() => setConfirmRates(true)}>Update from invoices</button>
        </div>
      )}
      {track && (
        <div className="tabs">
          <button className={tab === "items" ? "on" : ""} onClick={() => { setTab("items"); setQ(""); }}>Items</button>
          <button className={tab === "moves" ? "on" : ""} onClick={() => { setTab("moves"); setQ(""); }}>Stock movements</button>
        </div>
      )}
      <div className="bar-tools">
        <input className="inp" placeholder={tab === "items" ? "Search items" : "Search movements"} value={q} onChange={(e) => setQ(e.target.value)} />
        {tab === "items" && (<>
          {track && <label className="row small"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only</label>}
          <span style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => download("items-" + todayISO() + ".csv", stockCsv(db, track), "text/csv")}>Export items CSV</button>
        </>)}
      </div>
      <div className="card" style={{ padding: 0 }}><div className="tw">
        {!showMoves ? (
          list.length ? (
            <table className="tbl">
              <thead><tr><th>Code</th><th>Item</th><th>HSN</th><th className="num">Rate</th><th className="num">GST</th>{track && <th className="num">In stock</th>}<th></th></tr></thead>
              <tbody>{list.map((i) => (
                <tr key={i.id} style={i.active ? undefined : { opacity: 0.55 }}>
                  <td><b>{i.code}</b></td><td className="item-nm"><b>{i.name}</b><span className="small muted">{i.alt}{i.active ? "" : " · hidden from billing"}</span></td>
                  <td>{i.hsn}</td><td className="num">{money(i.rate)} / {i.unit}</td><td className="num">{trimNum(i.gst, 2)}%</td>
                  {track && <td className="num"><b>{trimNum(i.stock, 3)}</b> {i.unit} {i.stock <= 0 ? <span className="pill out">Out</span> : i.low > 0 && i.stock <= i.low ? <span className="pill low">Low</span> : null}</td>}
                  <td className="num">
                    {track && <><button className="btn sm" onClick={() => setDlg({ kind: "adjust", id: i.id })}>Adjust stock</button>{" "}
                    <button className="btn sm" onClick={() => setDlg({ kind: "hist", id: i.id })}>History</button>{" "}</>}
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
      {confirmRates && <ConfirmDialog title="Update from your invoices?" okLabel={`Update ${differing} items`} onClose={() => setConfirmRates(false)}
        message={`This sets the HSN, GST, unit and default rate of ${differing} standard items to the values on your sales invoices. Any change you made to those fields on these items will be replaced. Bills you already made are not changed.`}
        onOk={() => { let n = 0; update((d) => { n = applyInvoiceRates(d); }); toast(`${n} items updated from your invoices`); }} />}
      {dlg?.kind === "edit" && <ItemDialog id={dlg.id} onClose={() => setDlg(null)} />}
      {dlg?.kind === "adjust" && <AdjustDialog id={dlg.id} onClose={() => setDlg(null)} />}
      {dlg?.kind === "hist" && <HistoryDialog id={dlg.id} onClose={() => setDlg(null)} />}
    </>
  );
}
