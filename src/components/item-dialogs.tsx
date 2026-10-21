"use client";

import { useState } from "react";
import { N, dmy, round3, trimNum } from "@/lib/billing/calc";
import { MOVE_LABEL } from "@/lib/billing/constants";
import { itemById, moveStock, nextItemCode, uid } from "@/lib/billing/data";
import type { Item, MoveType } from "@/lib/billing/types";
import { useBilling } from "./billing-provider";
import { Dialog, ErrorBox } from "./dialog";

export function ItemDialog({ id, preset, onClose, onSaved }: { id: string | null; preset?: Partial<Item>; onClose: () => void; onSaved?: (it: Item) => void }) {
  const { db, update, toast } = useBilling();
  const it = id ? itemById(db, id) : null;
  const track = db.settings.trackStock;
  const v = it ?? { name: "", alt: "", hsn: "", unit: "NOS", rate: "", gst: 0, low: 0, ...preset };
  const [f, setF] = useState({ name: String(v.name), alt: String(v.alt), hsn: String(v.hsn), unit: String(v.unit), rate: String(v.rate), gst: String(v.gst), low: String(v.low), open: "0", active: it ? it.active : true });
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const save = () => {
    const name = f.name.trim(), unit = (f.unit.trim() || "NOS").toUpperCase();
    if (!name) return setErr("Enter the item name.");
    if (db.items.some((x) => x.name.toLowerCase() === name.toLowerCase() && x.id !== it?.id)) return setErr("An item with this name already exists.");
    const rec = { name, alt: f.alt.trim(), hsn: f.hsn.trim(), unit, rate: N(f.rate), gst: N(f.gst), low: N(f.low) };
    const newId = it?.id ?? uid();
    update((d) => {
      if (it) {
        Object.assign(itemById(d, it.id)!, rec, { active: f.active });
      } else {
        const saved: Item = { id: newId, code: nextItemCode(d), stock: 0, active: true, ...rec };
        d.items.push(saved);
        const o = N(f.open);
        if (o > 0) moveStock(d, saved, o, "OPENING", "", "Opening stock");
      }
    });
    toast("Item saved");
    onClose();
    onSaved?.({ ...(it ?? { stock: N(f.open), active: true, code: nextItemCode(db) }), id: newId, ...rec } as Item);
  };

  return (
    <Dialog title={it ? "Edit item" : "Add item"} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save item</button></>}>
      <ErrorBox msg={err} />
      <div className="small muted">Item code: <b>{it ? it.code : nextItemCode(db)}</b>{it ? "" : " (assigned automatically when you save)"}</div>
      <div className="f"><label htmlFor="i-name">Item name (as printed on the bill)</label><input className="inp" id="i-name" data-tamil value={f.name} onChange={set("name")} /></div>
      <div className="f"><label htmlFor="i-alt">English name or search keywords (not printed)</label><input className="inp" id="i-alt" data-tamil value={f.alt} onChange={set("alt")} placeholder="e.g. pickle, rasam powder" /></div>
      <div className="grid3">
        <div className="f"><label htmlFor="i-hsn">HSN code</label><input className="inp" id="i-hsn" inputMode="numeric" value={f.hsn} onChange={set("hsn")} /></div>
        <div className="f"><label htmlFor="i-unit">Unit</label><input className="inp" id="i-unit" list="unitList" value={f.unit} onChange={set("unit")} /></div>
        <div className="f"><label htmlFor="i-rate">Default rate ₹ per {(f.unit.trim() || "unit").toUpperCase()}</label><input className="inp" id="i-rate" type="number" step="any" min="0" inputMode="decimal" value={f.rate} onChange={set("rate")} /></div>
      </div>
      <div className="grid3">
        <div className="f"><label htmlFor="i-gst">GST %</label><input className="inp" id="i-gst" type="number" step="any" min="0" list="gstList" value={f.gst} onChange={set("gst")} /></div>
        {track && <div className="f"><label htmlFor="i-low">Low stock alert at</label><input className="inp" id="i-low" type="number" step="any" min="0" value={f.low} onChange={set("low")} /></div>}
        {track && (it
          ? <div className="f"><label>Current stock</label><div className="inp" style={{ background: "var(--surface2)" }}>{trimNum(it.stock, 3)} {it.unit}</div></div>
          : <div className="f"><label htmlFor="i-open">Opening stock</label><input className="inp" id="i-open" type="number" step="any" min="0" value={f.open} onChange={set("open")} /></div>)}
      </div>
      {it && (
        <>
          <label className="row small"><input type="checkbox" checked={f.active} onChange={set("active")} /> Show this item when billing</label>
          <div className="small muted">{track ? "Change stock with Adjust stock so the movement is recorded. " : ""}The default rate only pre-fills new bills. Old bills keep their own rate.</div>
        </>
      )}
    </Dialog>
  );
}

export function AdjustDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { db, update, toast } = useBilling();
  const it = itemById(db, id);
  const [type, setType] = useState<MoveType>("PURCHASE");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  if (!it) return null;
  const label = (type === "COUNT" ? "Counted stock" : type === "DAMAGE" ? "Quantity to remove" : "Quantity received") + ` (${it.unit})`;

  const save = () => {
    const q = N(qty), n = note.trim();
    if (type === "COUNT") {
      if (qty === "") return setErr("Enter the counted stock.");
      const d = round3(q - it.stock);
      if (d === 0) { onClose(); return toast("Stock already matches"); }
      update((x) => moveStock(x, itemById(x, id)!, d, "COUNT", "", n || "Physical count"));
    } else {
      if (q <= 0) return setErr("Enter a quantity above 0.");
      update((x) => moveStock(x, itemById(x, id)!, type === "DAMAGE" ? -q : q, type, "", n));
    }
    toast("Stock updated");
    onClose();
  };

  return (
    <Dialog title={"Adjust stock: " + it.name} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Update stock</button></>}>
      <ErrorBox msg={err} />
      <div className="small muted">Now in stock: <b>{trimNum(it.stock, 3)} {it.unit}</b></div>
      <div className="f"><label htmlFor="a-type">What happened</label>
        <select className="inp" id="a-type" value={type} onChange={(e) => setType(e.target.value as MoveType)}>
          <option value="PURCHASE">Stock received (add)</option><option value="RETURN">Returned by a customer (add)</option>
          <option value="DAMAGE">Damaged, expired or lost (remove)</option><option value="COUNT">Physical count (set exact stock)</option>
        </select></div>
      <div className="f"><label htmlFor="a-qty">{label}</label><input className="inp" id="a-qty" type="number" step="any" min="0" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
      <div className="f"><label htmlFor="a-note">Note (optional)</label><input className="inp" id="a-note" placeholder="Supplier, reason, bill no." value={note} onChange={(e) => setNote(e.target.value)} /></div>
    </Dialog>
  );
}

export function HistoryDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { db } = useBilling();
  const it = itemById(db, id);
  if (!it) return null;
  const list = [...db.ledger].reverse().filter((m) => m.itemId === id).slice(0, 100);
  return (
    <Dialog title={"History: " + it.name} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      {list.length ? (
        <div className="tw"><table className="tbl">
          <thead><tr><th>Date</th><th>Type</th><th className="num">Change</th><th className="num">Balance</th></tr></thead>
          <tbody>{list.map((m) => (
            <tr key={m.id}><td>{dmy(m.date)}</td>
              <td>{MOVE_LABEL[m.type] || m.type}<div className="small muted">{m.ref ? "Bill " + m.ref + " · " : ""}{m.note}</div></td>
              <td className="num">{m.qty > 0 ? "+" : ""}{trimNum(m.qty, 3)}</td><td className="num">{trimNum(m.bal, 3)}</td></tr>
          ))}</tbody></table></div>
      ) : <div className="empty">No movements yet.</div>}
    </Dialog>
  );
}
