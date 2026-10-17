"use client";

import { useRef, useState } from "react";
import { useBilling } from "@/components/billing-provider";
import { ConfirmDialog } from "@/components/dialog";
import { N, todayISO } from "@/lib/billing/calc";
import { STATES } from "@/lib/billing/constants";
import { migrate } from "@/lib/billing/data";
import { download, invoicesCsv, stockCsv } from "@/lib/billing/export";
import type { BillingData, Settings } from "@/lib/billing/types";

type Group = "biz" | "bank";

export default function SettingsPage() {
  const { db, update, replace, toast } = useBilling();
  const s = db.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState<BillingData | null>(null);
  const [clearing, setClearing] = useState(false);

  const setIn = (g: Group, k: string, v: string) => update((d) => { (d.settings[g] as Record<string, string>)[k] = v; });
  const setTop = <K extends keyof Settings>(k: K, v: Settings[K]) => update((d) => { d.settings[k] = v; });
  const text = (g: Group, k: string, label: string, span = "") => (
    <div className={`f ${span}`}><label htmlFor={`s-${g}.${k}`}>{label}</label>
      <input className="inp" id={`s-${g}.${k}`} value={(s[g] as Record<string, string>)[k]} onChange={(e) => setIn(g, k, e.target.value)} /></div>
  );

  const backup = () => {
    update((d) => { d.meta.lastBackup = Date.now(); });
    download("billing-backup-" + todayISO() + ".json", JSON.stringify(db, null, 1), "application/json");
    toast("Backup downloaded");
  };
  const onFile = (file?: File) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(String(r.result));
        if (!d || !Array.isArray(d.invoices) || !Array.isArray(d.items)) throw 0;
        setRestoring(migrate(d));
      } catch { toast("That file is not a valid backup"); }
    };
    r.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
      <div className="ph"><h1>Settings</h1></div>
      <div className="card"><h2>Your business</h2>
        <div className="small muted" style={{ margin: "-6px 0 12px" }}>Check every digit of the GSTIN, PAN and bank details against your records before printing.</div>
        <div className="grid2">
          {text("biz", "name", "Business name", "span2")}
          <div className="f span2"><label htmlFor="s-biz.address">Address</label><textarea className="inp" id="s-biz.address" rows={2} value={s.biz.address} onChange={(e) => setIn("biz", "address", e.target.value)} /></div>
          {text("biz", "mobile", "Mobile")}
          <div className="f"><label htmlFor="s-biz.state">State (decides CGST + SGST or IGST)</label>
            <select className="inp" id="s-biz.state" value={s.biz.state} onChange={(e) => setIn("biz", "state", e.target.value)}>{STATES.map((x) => <option key={x}>{x}</option>)}</select></div>
          {text("biz", "gstin", "GSTIN")}{text("biz", "pan", "PAN")}
        </div></div>
      <div className="card"><h2>Bank details printed on the bill</h2>
        <div className="grid2">{text("bank", "holder", "Account holder name")}{text("bank", "bank", "Bank and branch")}{text("bank", "ifsc", "IFSC code")}{text("bank", "acc", "Account number")}</div></div>
      <div className="card"><h2>Invoice numbering and text</h2>
        <div className="grid3">
          <div className="f"><label htmlFor="s-prefix">Number prefix (optional)</label><input className="inp" id="s-prefix" value={s.prefix} onChange={(e) => setTop("prefix", e.target.value)} /></div>
          <div className="f"><label htmlFor="s-nextNo">Next invoice number</label><input className="inp" id="s-nextNo" type="number" min="1" value={s.nextNo} onChange={(e) => setTop("nextNo", Math.max(0, N(e.target.value)))} /></div>
          <div className="f"><label htmlFor="s-dueDays">Payment due after (days)</label><input className="inp" id="s-dueDays" type="number" min="0" value={s.dueDays} onChange={(e) => setTop("dueDays", Math.max(0, N(e.target.value)))} /></div>
        </div>
        <div className="grid2" style={{ marginTop: 12 }}>
          <div className="f"><label htmlFor="s-notes">Default note on every bill</label><textarea className="inp" id="s-notes" rows={2} value={s.notes} onChange={(e) => setTop("notes", e.target.value)} /></div>
          <div className="f"><label htmlFor="s-terms">Terms and conditions</label><textarea className="inp" id="s-terms" rows={3} value={s.terms} onChange={(e) => setTop("terms", e.target.value)} /></div>
          <div className="f"><label htmlFor="s-sign">Signature line text</label><input className="inp" id="s-sign" value={s.signLabel} onChange={(e) => setTop("signLabel", e.target.value)} /></div>
        </div></div>
      <div className="card"><h2>Stock and totals</h2>
        <label className="row" style={{ marginBottom: 8 }}><input type="checkbox" checked={s.allowNegative} onChange={(e) => setTop("allowNegative", e.target.checked)} /> Allow billing more than the stock on hand</label>
        <label className="row"><input type="checkbox" checked={s.roundOff} onChange={(e) => setTop("roundOff", e.target.checked)} /> Round the total to the nearest rupee on new bills</label></div>
      <div className="card"><h2>Your data</h2>
        <div className="small muted" style={{ marginBottom: 12 }}>Your data is saved to your account and is available on any device you sign in on. A backup file is an extra copy you keep yourself.{db.meta.lastBackup ? " Last backup: " + new Date(db.meta.lastBackup).toLocaleString("en-IN") + "." : ""}</div>
        <div className="row">
          <button className="btn primary" onClick={backup}>Download backup</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Restore from backup</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="btn" onClick={() => download("invoices-" + todayISO() + ".csv", invoicesCsv(db), "text/csv")}>Export invoices CSV</button>
          <button className="btn" onClick={() => download("stock-" + todayISO() + ".csv", stockCsv(db), "text/csv")}>Export stock CSV</button>
          <button className="btn danger" onClick={() => setClearing(true)}>Clear sample data</button>
        </div></div>
      {restoring && <ConfirmDialog danger title="Restore this backup?" okLabel="Replace my data" onClose={() => setRestoring(null)}
        message={`This replaces everything in your account with the backup (${restoring.invoices.length} bills, ${restoring.items.length} items).`}
        onOk={() => { replace(restoring); toast("Backup restored"); }} />}
      {clearing && <ConfirmDialog danger title="Clear sample data?" okLabel="Clear sample data" onClose={() => setClearing(false)}
        message="This removes all items, customers, bills and stock history. Your business details, bank details and invoice numbering stay as they are."
        onOk={() => { update((d) => { d.items = []; d.customers = []; d.invoices = []; d.ledger = []; d.meta.sampleNote = false; }); toast("Sample data cleared"); }} />}
    </>
  );
}
