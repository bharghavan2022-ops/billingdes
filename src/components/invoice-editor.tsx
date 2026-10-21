"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { N, GSTIN_RE, addDays, calcInvoice, inWords, money, plain, round2, round3, todayISO, trimNum, qtyByItem } from "@/lib/billing/calc";
import { PAY_MODES, STATES } from "@/lib/billing/constants";
import { addCatalogueItems, applyStock, bumpNext, invById, isIntra, itemById, nextNoStr, sellerOf, sellerOfInvoice, stockProblems, uid } from "@/lib/billing/data";
import { CATALOGUE_SIZE } from "@/lib/billing/catalogue";
import type { Customer, Invoice, Item, Line, Party } from "@/lib/billing/types";
import { useBilling } from "./billing-provider";
import { ComboInput, type ComboOption } from "./combo-input";
import { ItemDialog } from "./item-dialogs";

const DKEY = "billing-desk-draft-v1";

interface Ed {
  mode: "new" | "edit" | "copy"; id: string | null; no: string; date: string; due: string; sellerId: string;
  custId: string; cust: Party; pos: string; shipSame: boolean; ship: { name: string; address: string };
  lines: Line[]; notes: string; received: string; recvMode: string; saveCust: boolean;
}
const blankLine = (): Line => ({ itemId: "", name: "", hsn: "", unit: "", qty: "", rate: "", disc: "", gst: "" });

export function InvoiceEditor({ mode, id }: { mode: "new" | "edit" | "copy"; id?: string }) {
  const { db, update, toast } = useBilling();
  const router = useRouter();
  const [dialogFor, setDialogFor] = useState<{ line: number; name: string } | null>(null);
  const [errs, setErrs] = useState<string[]>([]);
  const [fromDraft, setFromDraft] = useState(false);
  const errRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);

  const [ed, setEd] = useState<Ed>(() => {
    const base = newEd();
    if (mode === "new") {
      try {
        const d = JSON.parse(localStorage.getItem(DKEY) || "null") as Ed | null;
        if (d && d.mode === "new" && (d.lines.some((l) => l.itemId || l.name) || d.cust.name)) return { ...d, sellerId: sellerOf(db.settings, d.sellerId).id };
      } catch { /* ignore a corrupt draft */ }
      return base;
    }
    const inv = id ? invById(db, id) : undefined;
    if (!inv) return base;
    return fromInvoice(base, inv, mode);
  });
  useEffect(() => {
    if (mode === "new" && (ed.lines.some((l) => l.itemId || l.name) || ed.cust.name)) setFromDraft(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const source = id ? invById(db, id) : undefined;
  useEffect(() => {
    if (mode === "new") return;
    if (!source) { toast("Bill not found"); router.replace("/invoices"); }
    else if (source.status === "cancelled" && mode === "edit") { toast("Cancelled bills cannot be edited"); router.replace("/invoices/" + id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep an unsaved new bill in the browser so a refresh does not lose it.
  useEffect(() => {
    if (mode !== "new") return;
    const t = setTimeout(() => { try { localStorage.setItem(DKEY, JSON.stringify(ed)); } catch { /* storage full or blocked */ } }, 400);
    return () => clearTimeout(t);
  }, [ed, mode]);
  const clearDraft = () => { try { localStorage.removeItem(DKEY); } catch { /* ignore */ } };

  function newEd(): Ed {
    const t = todayISO(), sid = db.settings.sellerId;
    return { mode: "new", id: null, sellerId: sid, no: nextNoStr(db, sid), date: t, due: addDays(t, db.settings.dueDays), custId: "", cust: { name: "", address: "", mobile: "", gstin: "", pan: "" }, pos: sellerOf(db.settings, sid).biz.state, shipSame: true, ship: { name: "", address: "" }, lines: [blankLine()], notes: db.settings.notes, received: "", recvMode: PAY_MODES[0], saveCust: true };
  }
  function fromInvoice(e: Ed, inv: Invoice, m: "edit" | "copy"): Ed {
    const sid = sellerOfInvoice(db.settings, inv).id;
    const out: Ed = { ...e, sellerId: sid, no: nextNoStr(db, sid), custId: inv.custId || "", cust: { ...inv.cust }, pos: inv.pos, shipSame: inv.shipSame, ship: { ...inv.ship }, notes: inv.notes || "", lines: inv.lines.map((l) => ({ itemId: l.itemId, name: l.name, hsn: l.hsn, unit: l.unit, qty: l.qty, rate: l.rate, disc: l.disc || "", gst: l.gst })), saveCust: false };
    return m === "edit" ? { ...out, mode: "edit", id: inv.id, no: inv.no, date: inv.date, due: inv.due } : out;
  }

  /** Changing the firm moves the suggested invoice number to that firm's series and the default place of supply to its state. */
  const setSeller = (sid: string) => setEd((e) => {
    if (e.sellerId === sid) return e;
    const was = sellerOf(db.settings, e.sellerId), now = sellerOf(db.settings, sid);
    return { ...e, sellerId: sid, no: e.no === nextNoStr(db, e.sellerId) ? nextNoStr(db, sid) : e.no, pos: e.pos === was.biz.state ? now.biz.state : e.pos };
  });
  // A new bill follows the "Bill from" switch at the top of the page.
  useEffect(() => {
    if (mode === "new") setSeller(db.settings.sellerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.settings.sellerId]);

  const patch = (p: Partial<Ed>) => setEd((e) => ({ ...e, ...p }));
  const patchCust = (p: Partial<Party>) => setEd((e) => ({ ...e, cust: { ...e.cust, ...p } }));
  const setLine = (i: number, p: Partial<Line>) => setEd((e) => ({ ...e, lines: e.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) }));

  const seller = sellerOf(db.settings, ed.sellerId);
  const c = calcInvoice(ed.lines, isIntra(db, ed.pos, ed.sellerId), db.settings.roundOff);
  const old = ed.mode === "edit" ? invById(db, ed.id!) : null;
  const track = db.settings.trackStock;
  const gstBad = !!ed.cust.gstin.trim() && !GSTIN_RE.test(ed.cust.gstin.trim().toUpperCase());

  function avail(i: number) {
    const l = ed.lines[i], it = l.itemId ? itemById(db, l.itemId) : null;
    if (!it) return null;
    const om = old ? qtyByItem(old.lines) : {};
    const others = ed.lines.reduce((s, x, j) => (j !== i && x.itemId === l.itemId ? s + N(x.qty) : s), 0);
    return { it, avail: round3(it.stock + (om[l.itemId] || 0) - others) };
  }

  function pickItem(i: number, it: Pick<Item, "id" | "name" | "hsn" | "unit" | "rate" | "gst">) {
    setEd((e) => {
      const lines = e.lines.map((l, j) => (j === i ? { ...l, itemId: it.id, name: it.name, hsn: it.hsn, unit: it.unit, rate: it.rate, gst: it.gst, qty: N(l.qty) ? l.qty : 1 } : l));
      if (i === lines.length - 1) lines.push(blankLine());
      return { ...e, lines };
    });
    setTimeout(() => { const q = linesRef.current?.querySelector<HTMLInputElement>(`.ln[data-i="${i}"] [data-f="qty"]`); q?.focus(); q?.select(); }, 0);
  }
  function pickCust(cu: Customer) {
    setEd((e) => ({ ...e, cust: { name: cu.name, address: cu.address, mobile: cu.mobile, gstin: cu.gstin, pan: cu.pan }, custId: cu.id, pos: cu.state || e.pos }));
  }
  // Every matching ingredient is listed (scroll the list), each with its code, sorted by code.
  const itemOptions = (i: number) => (): ComboOption[] => {
    const q = ed.lines[i].name.trim().toLowerCase();
    const list = db.items.filter((x) => x.active && (!q || (x.code + " " + x.name + " " + x.alt + " " + x.hsn).toLowerCase().includes(q)))
      .sort((a, b) => (a.code || "").localeCompare(b.code || "") || a.name.localeCompare(b.name)).slice(0, 300);
    const o: ComboOption[] = list.map((x) => ({
      key: x.id, pick: () => pickItem(i, x),
      content: <>
        <span className="opt-main"><b className="opt-code">{x.code}</b><b>{x.name}</b> <small>{x.alt}</small></span>
        <small>{track ? (x.stock > 0 ? `${trimNum(x.stock, 3)} ${x.unit}` : "no stock") + (x.rate > 0 ? ` · ₹${trimNum(x.rate, 2)}` : "") : [x.hsn && `HSN ${x.hsn}`, `GST ${trimNum(x.gst, 2)}%`, x.rate > 0 && `₹${trimNum(x.rate, 2)}`].filter(Boolean).join(" · ")}</small>
      </>,
    }));
    if (db.items.length === 0) {
      o.push({ key: "__catalogue", add: true, content: <span>⬇ Load the {CATALOGUE_SIZE} standard items (codes 001–{CATALOGUE_SIZE})</span>,
        pick: () => { let n = 0; update((d) => { n = addCatalogueItems(d).added; }); toast(`${n} items added. Search again to pick one.`); } });
    }
    o.push({ key: "__add", add: true, pick: () => setDialogFor({ line: i, name: ed.lines[i].name.trim() }), content: <span>＋ Add {q ? `“${ed.lines[i].name.trim()}”` : "a new item"} to your items</span> });
    return o;
  };
  const custOptions = (): ComboOption[] => {
    const q = ed.cust.name.trim().toLowerCase();
    return db.customers.filter((x) => !q || (x.name + " " + x.mobile + " " + x.gstin).toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 100)
      .map((x) => ({ key: x.id, pick: () => pickCust(x), content: <><span><b>{x.name}</b></span><small>{x.mobile}</small></> }));
  };

  function save(print: boolean) {
    const lines: Line[] = ed.lines.filter((l) => l.itemId || String(l.name).trim() || N(l.qty)).map((l) => ({ itemId: l.itemId, name: String(l.name).trim(), hsn: l.hsn, unit: l.unit, qty: N(l.qty), rate: N(l.rate), disc: N(l.disc), gst: N(l.gst) }));
    const no = ed.no.trim(), errors: string[] = [];
    if (!no) errors.push("Enter an invoice number."); else if (db.invoices.some((i) => i.no === no && i.id !== ed.id)) errors.push(`Invoice number ${no} is already used.`);
    if (!ed.date) errors.push("Choose the invoice date.");
    if (!ed.cust.name.trim()) errors.push("Enter the customer name.");
    if (!lines.length) errors.push("Add at least one item.");
    lines.forEach((l, i) => {
      if (!l.itemId) errors.push(`Item ${i + 1}: choose “${l.name || "an item"}” from the list, or add it as a new item.`);
      else if (N(l.qty) <= 0) errors.push(`Item ${i + 1} (${l.name}): quantity must be above 0.`);
    });
    if (!errors.length && track && !db.settings.allowNegative) errors.push(...stockProblems(db, lines, old));
    setErrs(errors);
    if (errors.length) { setTimeout(() => errRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0); return; }

    const snap = { name: ed.cust.name.trim(), address: ed.cust.address.trim(), mobile: ed.cust.mobile.trim(), gstin: ed.cust.gstin.trim().toUpperCase(), pan: ed.cust.pan.trim().toUpperCase() };
    const invId = old ? old.id : uid();
    const newCustId = !ed.custId && ed.saveCust ? uid() : "";
    update((d) => {
      const custId = ed.custId || newCustId;
      if (newCustId) d.customers.push({ id: newCustId, state: ed.pos, ...snap });
      const intra = isIntra(d, ed.pos, ed.sellerId), prior = old ? invById(d, old.id)! : null;
      const rec = { no, date: ed.date, due: ed.due, sellerId: ed.sellerId, custId, cust: snap, shipSame: ed.shipSame, ship: { name: ed.ship.name.trim(), address: ed.ship.address.trim() }, pos: ed.pos, intra, roundOffOn: prior ? prior.roundOffOn : d.settings.roundOff, lines, notes: ed.notes.trim(), grand: 0 };
      rec.grand = calcInvoice(lines, rec.intra, rec.roundOffOn).grand;
      if (prior) {
        const prev = { lines: prior.lines.map((l) => ({ ...l })) };
        Object.assign(prior, rec, { updatedAt: Date.now() });
        if (d.settings.trackStock) applyStock(d, prior, prev);
      } else {
        const inv: Invoice = { id: invId, status: "active", payments: [], createdAt: Date.now(), ...rec };
        d.invoices.push(inv);
        if (d.settings.trackStock) applyStock(d, inv, null);
        const r = N(ed.received);
        if (r > 0) inv.payments.push({ id: uid(), date: ed.date, amount: round2(Math.min(r, inv.grand)), mode: ed.recvMode, note: "" });
        bumpNext(d, no, ed.sellerId);
      }
    });
    clearDraft();
    toast("Invoice " + no + " saved");
    router.push("/invoices/" + invId + (print ? "?print=1" : ""));
  }

  const cancelEd = () => {
    if (ed.mode === "new") clearDraft();
    router.push(ed.mode === "edit" ? "/invoices/" + ed.id : "/");
  };
  const startNew = () => { clearDraft(); setEd(newEd()); setFromDraft(false); };
  const showSaveCust = !ed.custId && !!ed.cust.name.trim();

  return (
    <>
      <div className="ph">
        <div>{ed.mode === "edit" && <Link className="back" href={"/invoices/" + ed.id}>← Back to invoice</Link>}<h1>{ed.mode === "edit" ? "Edit invoice " + ed.no : "New bill"}</h1></div>
        {fromDraft && <div className="row small muted">Restored your unsaved bill <button className="btn sm" onClick={startNew}>Start a new one</button></div>}
      </div>
      {errs.length > 0 && <div className="err" ref={errRef}><b>Fix these before saving</b><ul>{errs.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      <div className="card">
        <div className="lbl">Bill from</div>
        <div className="segmented" role="group" aria-label="Bill from">
          {db.settings.sellers.map((s) => (
            <button key={s.id} type="button" className={s.id === ed.sellerId ? "on" : ""} aria-pressed={s.id === ed.sellerId} onClick={() => setSeller(s.id)}>{s.biz.name || "Business"}</button>
          ))}
        </div>
        <div className="small muted" style={{ marginTop: 8 }}>{[seller.biz.address, seller.biz.gstin && "GSTIN " + seller.biz.gstin, seller.biz.pan && "PAN " + seller.biz.pan].filter(Boolean).join(" · ")}</div>
      </div>
      <div className="card"><div className="grid3">
        <div className="f"><label htmlFor="e-no">Invoice no.</label><input className="inp" id="e-no" value={ed.no} onChange={(e) => patch({ no: e.target.value })} /></div>
        <div className="f"><label htmlFor="e-date">Invoice date</label><input className="inp" type="date" id="e-date" value={ed.date} onChange={(e) => patch({ date: e.target.value })} /></div>
        <div className="f"><label htmlFor="e-due">Due date</label><input className="inp" type="date" id="e-due" value={ed.due} onChange={(e) => patch({ due: e.target.value })} /></div>
      </div></div>
      <div className="grid2" style={{ alignItems: "start" }}>
        <div className="card"><h2>Bill to</h2><div className="grid2">
          <div className="f span2"><label htmlFor="e-cname">Customer name (type to search saved customers)</label>
            <ComboInput className="inp" id="e-cname" value={ed.cust.name} onValueChange={(v) => setEd((e) => ({ ...e, cust: { ...e.cust, name: v }, custId: "" }))} options={custOptions} /></div>
          <div className="f span2"><label htmlFor="e-caddr">Address</label><textarea className="inp" id="e-caddr" rows={2} value={ed.cust.address} onChange={(e) => patchCust({ address: e.target.value })} /></div>
          <div className="f"><label htmlFor="e-cmob">Mobile</label><input className="inp" id="e-cmob" inputMode="tel" value={ed.cust.mobile} onChange={(e) => patchCust({ mobile: e.target.value })} /></div>
          <div className="f"><label htmlFor="e-pos">Place of supply</label><select className="inp" id="e-pos" value={ed.pos} onChange={(e) => patch({ pos: e.target.value })}>{STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="f"><label htmlFor="e-cgst">GSTIN</label><input className="inp" id="e-cgst" style={{ textTransform: "uppercase" }} value={ed.cust.gstin} onChange={(e) => patchCust({ gstin: e.target.value })} />{gstBad && <div className="hint bad">This GSTIN does not look valid.</div>}</div>
          <div className="f"><label htmlFor="e-cpan">PAN</label><input className="inp" id="e-cpan" style={{ textTransform: "uppercase" }} value={ed.cust.pan} onChange={(e) => patchCust({ pan: e.target.value })} /></div>
          {showSaveCust && <label className="row small span2"><input type="checkbox" checked={ed.saveCust} onChange={(e) => patch({ saveCust: e.target.checked })} /> Save to customers for next time</label>}
        </div></div>
        <div className="card"><h2>Ship to</h2>
          <label className="row small" style={{ marginBottom: 10 }}><input type="checkbox" checked={ed.shipSame} onChange={(e) => patch({ shipSame: e.target.checked })} /> Same as billing address</label>
          {!ed.shipSame && <div className="grid2">
            <div className="f span2"><label htmlFor="e-sname">Name</label><input className="inp" id="e-sname" value={ed.ship.name} onChange={(e) => patch({ ship: { ...ed.ship, name: e.target.value } })} /></div>
            <div className="f span2"><label htmlFor="e-saddr">Address</label><textarea className="inp" id="e-saddr" rows={2} value={ed.ship.address} onChange={(e) => patch({ ship: { ...ed.ship, address: e.target.value } })} /></div></div>}
        </div>
      </div>
      <div className="card"><h2>Items</h2>
        <div className="ln-head"><span></span><span>Item</span><span>HSN</span><span>Qty</span><span>Rate ₹</span><span>Disc %</span><span>GST %</span><span style={{ textAlign: "right" }}>Amount</span><span></span></div>
        <div ref={linesRef}>
          {ed.lines.map((l, i) => {
            const a = avail(i), over = a ? N(l.qty) > a.avail + 1e-9 : false, it = l.itemId ? itemById(db, l.itemId) : null;
            return (
              <div className="ln" data-i={i} key={i}>
                <div className="ln-no">{i + 1}</div>
                <div className="f c-item"><label>Item</label>
                  <ComboInput className="inp" placeholder="Search item (Tamil or English)" tabPicks value={l.name} onValueChange={(v) => setLine(i, { name: v, itemId: "" })} options={itemOptions(i)} />
                  <div className={"hint" + (over && !db.settings.allowNegative ? " bad" : "")}>{track && a ? (over ? `Only ${trimNum(Math.max(a.avail, 0), 3)} ${a.it.unit} available` : `In stock: ${trimNum(a.avail, 3)} ${a.it.unit}`) : ""}</div></div>
                <div className="f c-hsn"><label>HSN</label><input className="inp" inputMode="numeric" value={l.hsn} onChange={(e) => setLine(i, { hsn: e.target.value })} /></div>
                <div className="f"><label>Qty <span className="u">{l.unit}</span></label><input className="inp" type="number" step="any" min="0" inputMode="decimal" data-f="qty" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} /></div>
                <div className="f"><label>Rate ₹</label><input className="inp" type="number" step="any" min="0" inputMode="decimal" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} />
                  <div className="hint">{it && N(l.rate) !== N(it.rate) && <button className="lnk" onClick={() => { update((d) => { itemById(d, it.id)!.rate = N(l.rate); }); toast("Default rate for " + it.name + " updated"); }}>Make ₹{trimNum(l.rate || 0, 2)} the default</button>}</div></div>
                <div className="f"><label>Disc %</label><input className="inp" type="number" step="any" min="0" max="100" inputMode="decimal" value={l.disc} onChange={(e) => setLine(i, { disc: e.target.value })} /></div>
                <div className="f"><label>GST %</label><input className="inp" type="number" step="any" min="0" list="gstList" inputMode="decimal" value={l.gst} onChange={(e) => setLine(i, { gst: e.target.value })} /></div>
                <div className="ln-amt"><label>Amount</label><b>{plain(c.rows[i].amount)}</b></div>
                <button className="x" aria-label="Remove line" onClick={() => setEd((e) => ({ ...e, lines: e.lines.length === 1 ? [blankLine()] : e.lines.filter((_, j) => j !== i) }))}>×</button>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 10 }}><button className="btn sm" onClick={() => { patch({ lines: [...ed.lines, blankLine()] }); setTimeout(() => linesRef.current?.querySelector<HTMLInputElement>(".ln:last-child input")?.focus(), 0); }}>＋ Add another item</button></div>
      </div>
      <div className="grid2" style={{ alignItems: "start" }}>
        <div className="card"><h2>Notes and payment</h2>
          <div className="f" style={{ marginBottom: 12 }}><label htmlFor="e-notes">Notes printed on the bill</label><textarea className="inp" id="e-notes" rows={2} value={ed.notes} onChange={(e) => patch({ notes: e.target.value })} /></div>
          {ed.mode === "edit" ? <div className="small muted">Payments are managed on the invoice page.</div> : (
            <div className="grid2">
              <div className="f"><label htmlFor="e-recv">Amount received now ₹</label><input className="inp" id="e-recv" type="number" step="any" min="0" inputMode="decimal" value={ed.received} onChange={(e) => patch({ received: e.target.value })} /></div>
              <div className="f"><label htmlFor="e-rmode">Mode</label><select className="inp" id="e-rmode" value={ed.recvMode} onChange={(e) => patch({ recvMode: e.target.value })}>{PAY_MODES.map((m) => <option key={m}>{m}</option>)}</select></div>
            </div>)}
        </div>
        <div className="card"><h2>Bill summary</h2>
          <div className="sumrows">
            <div><span>Taxable amount</span><span>{money(c.taxable)}</span></div>
            {c.disc > 0 && <div className="muted"><span>Discount given</span><span>{money(c.disc)}</span></div>}
            {c.groups.length === 0 && <div className="muted"><span>No GST on these items</span><span></span></div>}
            {c.intra
              ? c.groups.map((x) => <div key={x.rate} style={{ display: "contents" }}><div><span>CGST @{trimNum(x.rate / 2, 3)}%</span><span>{money(x.cgst)}</span></div><div><span>SGST @{trimNum(x.rate / 2, 3)}%</span><span>{money(x.sgst)}</span></div></div>)
              : c.groups.map((x) => <div key={x.rate}><span>IGST @{trimNum(x.rate, 2)}%</span><span>{money(x.tax)}</span></div>)}
            {c.roundOff !== 0 && <div><span>Round off</span><span>{c.roundOff < 0 ? "-" : ""}₹{plain(Math.abs(c.roundOff))}</span></div>}
            <div className="big"><span>Total</span><span>{money(c.grand)}</span></div>
          </div>
          <div className="words">{inWords(c.grand)}</div>
          <div className="small muted" style={{ marginTop: 6 }}>{c.intra ? "Within " + seller.biz.state + ": CGST and SGST" : "Other state: IGST"}</div>
        </div>
      </div>
      <div className="actbar">
        <div className="tot">Grand total<b>{money(c.grand)}</b></div>
        <div className="row"><button className="btn cancel-ed" onClick={cancelEd}>Cancel</button><button className="btn" onClick={() => save(false)}>Save</button><button className="btn primary" onClick={() => save(true)}>Save and print</button></div>
      </div>
      {dialogFor && <ItemDialog id={null} preset={{ name: dialogFor.name }} onClose={() => setDialogFor(null)} onSaved={(it) => pickItem(dialogFor.line, it)} />}
    </>
  );
}
