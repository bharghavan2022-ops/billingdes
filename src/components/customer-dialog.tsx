"use client";

import { useState } from "react";
import { STATES } from "@/lib/billing/constants";
import { custById, uid } from "@/lib/billing/data";
import { useBilling } from "./billing-provider";
import { Dialog, ErrorBox } from "./dialog";

export function CustomerDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { db, update, toast } = useBilling();
  const c = id ? custById(db, id) : null;
  const [f, setF] = useState({ name: c?.name ?? "", address: c?.address ?? "", mobile: c?.mobile ?? "", gstin: c?.gstin ?? "", pan: c?.pan ?? "", state: c?.state ?? db.settings.biz.state });
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const save = () => {
    const name = f.name.trim();
    if (!name) return setErr("Enter the customer name.");
    const rec = { name, address: f.address.trim(), mobile: f.mobile.trim(), state: f.state, gstin: f.gstin.trim().toUpperCase(), pan: f.pan.trim().toUpperCase() };
    update((d) => { if (c) Object.assign(custById(d, c.id)!, rec); else d.customers.push({ id: uid(), ...rec }); });
    toast("Customer saved");
    onClose();
  };
  const del = () => {
    if (!c) return;
    if (db.invoices.some((i) => i.custId === c.id)) return setErr("This customer has bills, so it cannot be deleted. Old bills keep their own copy of the details.");
    update((d) => { d.customers = d.customers.filter((x) => x.id !== c.id); });
    toast("Customer deleted");
    onClose();
  };

  return (
    <Dialog title={c ? "Edit customer" : "Add customer"} onClose={onClose} footer={<>
      {c && <button className="btn danger" style={{ marginRight: "auto" }} onClick={del}>Delete</button>}
      <button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save customer</button></>}>
      <ErrorBox msg={err} />
      <div className="f"><label htmlFor="c-name">Name</label><input className="inp" id="c-name" value={f.name} onChange={set("name")} /></div>
      <div className="f"><label htmlFor="c-addr">Address</label><textarea className="inp" id="c-addr" value={f.address} onChange={set("address")} /></div>
      <div className="grid2">
        <div className="f"><label htmlFor="c-mob">Mobile</label><input className="inp" id="c-mob" inputMode="tel" value={f.mobile} onChange={set("mobile")} /></div>
        <div className="f"><label htmlFor="c-state">State (place of supply)</label><select className="inp" id="c-state" value={f.state} onChange={set("state")}>{STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="f"><label htmlFor="c-gst">GSTIN</label><input className="inp" id="c-gst" value={f.gstin} onChange={set("gstin")} style={{ textTransform: "uppercase" }} /></div>
        <div className="f"><label htmlFor="c-pan">PAN</label><input className="inp" id="c-pan" value={f.pan} onChange={set("pan")} style={{ textTransform: "uppercase" }} /></div>
      </div>
    </Dialog>
  );
}
