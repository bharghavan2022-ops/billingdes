"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBilling } from "@/components/billing-provider";
import { ConfirmDialog } from "@/components/dialog";
import { Paper } from "@/components/paper";
import { PayDialog } from "@/components/pay-dialog";
import { StatusPill } from "@/components/pill";
import { N, dmy, invPaid, invStatus, money, round2, todayISO } from "@/lib/billing/calc";
import { COPIES, type CopyKey } from "@/lib/billing/constants";
import { invById, itemById, moveStock } from "@/lib/billing/data";

const COPY_OPTIONS: [CopyKey, string][] = [["orig", "Original copy"], ["dup", "Duplicate copy"], ["trip", "Triplicate copy"], ["all", "All 3 copies"], ["none", "No copy label"]];

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { db, update, toast } = useBilling();
  const router = useRouter();
  const [copy, setCopy] = useState<CopyKey>("orig");
  const [pay, setPay] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [printLabels, setPrintLabels] = useState<string[] | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const inv = invById(db, id);

  // Scale the A4 preview to the available width.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => el.style.setProperty("--z", Math.min(1, (el.clientWidth - 8) / 794).toFixed(3));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [inv]);

  // Printing: render the chosen copies into #printArea, open the print dialog, then clean up.
  useEffect(() => {
    if (!printLabels || !inv) return;
    const old = document.title;
    document.title = "Invoice " + inv.no + " - " + inv.cust.name;
    const done = () => { document.title = old; setPrintLabels(null); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    const tm = setTimeout(() => window.print(), 60);
    return () => { clearTimeout(tm); window.removeEventListener("afterprint", done); };
  }, [printLabels, inv]);

  // "Save and print" from the editor arrives with ?print=1.
  useEffect(() => {
    if (inv && new URLSearchParams(location.search).get("print") === "1") {
      history.replaceState(null, "", location.pathname);
      setPrintLabels([COPIES.orig]);
    }
  }, [inv]);

  useEffect(() => { if (!inv) { toast("Bill not found"); router.replace("/invoices"); } }, [inv, toast, router]);
  if (!inv) return null;

  const t = todayISO(), st = invStatus(inv, t), paid = invPaid(inv), bal = round2(inv.grand - paid);
  const labels = copy === "all" ? [COPIES.orig, COPIES.dup, COPIES.trip] : [COPIES[copy]];

  const cancel = () => {
    update((d) => {
      const x = invById(d, id)!;
      if (d.settings.trackStock) x.lines.forEach((l) => { const it = itemById(d, l.itemId); if (it) moveStock(d, it, N(l.qty), "CANCEL", x.no, "Invoice cancelled", todayISO()); });
      x.status = "cancelled"; x.cancelledAt = Date.now();
    });
    toast("Invoice cancelled");
  };

  return (
    <>
      <div className="ph">
        <div><Link className="back" href="/invoices">← All invoices</Link>
          <h1>Invoice {inv.no} <StatusPill st={st} style={{ verticalAlign: "middle" }} /></h1></div>
        <div className="row">
          <select className="inp sm" aria-label="Copy type" value={copy} onChange={(e) => setCopy(e.target.value as CopyKey)}>
            {COPY_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button className="btn primary" onClick={() => setPrintLabels(labels)}>Print or save as PDF</button>
        </div>
      </div>
      <div className="card"><div className="split" style={{ margin: 0 }}>
        <div><div className="lbl">Customer</div><b>{inv.cust.name}</b><div className="small muted">{inv.cust.mobile}</div>
          <div className="row" style={{ marginTop: 12 }}>
            {inv.status !== "cancelled" && <>
              <button className="btn sm" disabled={bal <= 0} onClick={() => setPay(true)}>Record payment</button>
              <Link className="btn sm" href={"/edit/" + inv.id}>Edit</Link></>}
            <Link className="btn sm" href={"/copy/" + inv.id}>Duplicate bill</Link>
            {inv.status !== "cancelled" && <button className="btn sm danger" onClick={() => setConfirmCancel(true)}>Cancel invoice</button>}
          </div></div>
        <div className="sumrows">
          <div><span>Invoice total</span><b>{money(inv.grand)}</b></div>
          <div><span>Received</span><span>{money(paid)}</span></div>
          <div className="big"><span>Balance</span><span>{inv.status === "cancelled" ? "–" : money(Math.max(0, bal))}</span></div>
          {(inv.payments || []).map((p) => (
            <div className="small muted" key={p.id}><span>{dmy(p.date)} · {p.mode}{p.note ? " · " + p.note : ""}</span>
              <span>{money(p.amount)} <button className="lnk" onClick={() => { update((d) => { const x = invById(d, id)!; x.payments = x.payments.filter((q) => q.id !== p.id); }); toast("Payment removed"); }}>remove</button></span></div>
          ))}
        </div>
      </div></div>
      <div className="small muted" style={{ margin: "0 0 10px" }}>In the print window, pick your printer, or choose <b>Save as PDF</b> as the destination. Headers and footers do not appear on this bill.</div>
      <div className="paperwrap" ref={wrap}>
        {copy === "all" ? <Paper inv={inv} settings={db.settings} label={COPIES.orig} /> : <Paper inv={inv} settings={db.settings} label={COPIES[copy]} />}
      </div>
      {pay && <PayDialog id={id} onClose={() => setPay(false)} />}
      {confirmCancel && <ConfirmDialog danger title={"Cancel invoice " + inv.no + "?"} okLabel="Cancel invoice" onClose={() => setConfirmCancel(false)} onOk={cancel}
        message={(db.settings.trackStock ? "The goods go back into stock and the bill is marked cancelled. " : "The bill is marked cancelled. ") + "The invoice number stays on record and cannot be reused."} />}
      {printLabels && createPortal(<div id="printArea">{printLabels.map((l) => <Paper key={l} inv={inv} settings={db.settings} label={l} />)}</div>, document.body)}
    </>
  );
}
