"use client";

import { useState } from "react";
import { N, invPaid, money, round2, todayISO } from "@/lib/billing/calc";
import { PAY_MODES } from "@/lib/billing/constants";
import { invById, uid } from "@/lib/billing/data";
import { useBilling } from "./billing-provider";
import { Dialog, ErrorBox } from "./dialog";

export function PayDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { db, update, toast } = useBilling();
  const inv = invById(db, id);
  const bal = inv ? round2(inv.grand - invPaid(inv)) : 0;
  const [amt, setAmt] = useState(bal > 0 ? String(bal) : "");
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState(PAY_MODES[0]);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  if (!inv) return null;

  const save = () => {
    const a = N(amt);
    if (a <= 0) return setErr("Enter an amount above 0.");
    if (a > bal + 0.004) return setErr("This is more than the balance of " + money(bal) + ".");
    update((d) => invById(d, id)!.payments.push({ id: uid(), date: date || todayISO(), amount: round2(a), mode, note: note.trim() }));
    toast("Payment recorded");
    onClose();
  };
  return (
    <Dialog title="Record payment" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save payment</button></>}>
      <ErrorBox msg={err} />
      <div className="small muted">Balance due: <b>{money(bal)}</b></div>
      <div className="grid2">
        <div className="f"><label htmlFor="p-amt">Amount ₹</label><input className="inp" id="p-amt" type="number" step="any" min="0" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></div>
        <div className="f"><label htmlFor="p-date">Date</label><input className="inp" id="p-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="f"><label htmlFor="p-mode">Mode</label><select className="inp" id="p-mode" value={mode} onChange={(e) => setMode(e.target.value)}>{PAY_MODES.map((m) => <option key={m}>{m}</option>)}</select></div>
        <div className="f"><label htmlFor="p-note">Note</label><input className="inp" id="p-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
    </Dialog>
  );
}
