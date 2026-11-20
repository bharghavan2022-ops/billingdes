import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { N, dmy, fmtQty, inWords, invPaid, plain, round2, subUnitOf, totalsOf, trimNum } from "@/lib/billing/calc";
import { DEFAULT_HEADING, FULLROWS, LASTROWS } from "@/lib/billing/constants";
import { sellerOfInvoice } from "@/lib/billing/data";
import { bizFor, tr } from "@/lib/billing/lang";
import type { BillingData, Invoice } from "@/lib/billing/types";

type Totals = ReturnType<typeof totalsOf>;

const useLayoutEffectSafe = typeof window !== "undefined" ? useLayoutEffect : useEffect;
const SAFETY = 8;

/** Split the rows over pages from the real heights of the rows, so no row is ever cut off or lost at the bottom of a page. */
export function paginate(rows: number[], avail: { single: number; first: number; mid: number; last: number }, minLast = 2): number[][] {
  const out: number[][] = [];
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  if (sum(rows) <= avail.single) return [rows.map((_, i) => i)];
  let i = 0;
  while (i < rows.length) {
    const rest = rows.slice(i);
    if (out.length > 0 && sum(rest) <= avail.last) { out.push(rest.map((_, j) => i + j)); break; }
    // Fill the page as full as it will go (the first page has no "brought forward" row, later ones do)...
    const cap = out.length === 0 ? avail.first : avail.mid;
    let used = 0, take = 0;
    while (take < rest.length && (take === 0 || used + rest[take] <= cap)) used += rest[take++];
    // ...but leave a couple of rows for the last page, so it is never just a footer.
    take = Math.max(1, Math.min(take, rest.length - Math.min(minLast, rest.length - 1)));
    out.push(Array.from({ length: take }, (_, j) => i + j));
    i += take;
  }
  return out.length ? out : [[]];
}

export function Paper({ inv, settings, label }: { inv: Invoice; settings: BillingData["settings"]; label: string }) {
  const c = totalsOf(inv), showDisc = inv.lines.some((l) => N(l.disc) > 0);
  const cols = showDisc ? "8% 29% 9% 14% 10% 8% 11% 11%" : "8% 32% 10% 14% 11% 12% 13%";
  const all = inv.lines.map((_, i) => i);
  const ruler = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number[][] | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);

  // Measure every row on a hidden single-page copy, then split the rows into pages that really fit.
  useLayoutEffectSafe(() => {
    if (!host) return;
    const measure = () => {
      const el = ruler.current;
      if (!el) return;
      const pages = el.querySelectorAll<HTMLElement>(".paper");
      const body = (pg?: HTMLElement) => pg?.querySelector<HTMLElement>(".p-body")?.getBoundingClientRect().height ?? 0;
      const rows = Array.from(pages[0]?.querySelectorAll<HTMLElement>(".p-body .r") ?? []).map((r) => r.getBoundingClientRect().height);
      if (rows.length !== inv.lines.length || pages.length < 4) return;
      // Room for rows on a one-page bill, on the first page, on the last page and on a page in between (each has different top and bottom rows).
      const next = paginate(rows, { single: body(pages[0]) - SAFETY, first: body(pages[1]) - SAFETY, last: body(pages[2]) - SAFETY, mid: body(pages[3]) - SAFETY });
      setMeasured((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    document.fonts?.ready.then(measure);
  }, [host, inv, settings, label]);

  const rest = [...all], fallback: number[][] = [];
  while (rest.length > LASTROWS) fallback.push(rest.splice(0, Math.min(FULLROWS, rest.length - 1)));
  fallback.push(rest);
  const chunks = measured ?? fallback;
  return (
    <>
      {chunks.map((ch, k) => {
        const before = chunks.slice(0, k).flat();
        const carry = { tax: before.reduce((a, i) => a + c.rows[i].tax, 0), amount: before.reduce((a, i) => a + c.rows[i].amount, 0) };
        return <Page key={k} {...{ inv, settings, c, label, ch, k, n: chunks.length, cols, showDisc, carry }} />;
      })}
      {host && createPortal(
        <div ref={ruler} className="p-ruler" aria-hidden="true">
          <Page {...{ inv, settings, c, label, ch: all, k: 0, n: 1, cols, showDisc }} />
          <Page {...{ inv, settings, c, label, ch: [], k: 0, n: 2, cols, showDisc }} />
          <Page {...{ inv, settings, c, label, ch: [], k: 1, n: 2, cols, showDisc }} />
          <Page {...{ inv, settings, c, label, ch: [], k: 1, n: 3, cols, showDisc }} />
        </div>, host)}
    </>
  );
}

function Page({ inv, settings, c, label, ch, k, n, cols, showDisc, carry }: {
  inv: Invoice; settings: BillingData["settings"]; c: Totals; label: string; ch: number[]; k: number; n: number; cols: string; showDisc: boolean;
  /** Tax and amount of every earlier page, shown at the top of this page. */
  carry?: { tax: number; amount: number };
}) {
  const lang = inv.lang, T = (x: string) => tr(lang, x);
  const seller = sellerOfInvoice(settings, inv), b = bizFor(seller.biz, lang), bk = seller.bank, last = k === n - 1, g = { gridTemplateColumns: cols };
  const paid = invPaid(inv), bal = round2(inv.grand - paid), hasBank = bk.acc || bk.ifsc || bk.holder || bk.customerId;
  const taxRows = c.intra
    ? c.groups.map((x) => (<Fragment key={x.rate}><div><span>CGST @{trimNum(x.rate / 2, 3)}%</span><span>₹{plain(x.cgst)}</span></div><div><span>SGST @{trimNum(x.rate / 2, 3)}%</span><span>₹{plain(x.sgst)}</span></div></Fragment>))
    : c.groups.map((x) => <div key={x.rate}><span>IGST @{trimNum(x.rate, 2)}%</span><span>₹{plain(x.tax)}</span></div>);
  const bankBlock = hasBank && <div className="sec"><h4>{T("BANK DETAILS")}</h4><div>{T("Name")}: {bk.holder}</div><div>{T("IFSC Code")}: {bk.ifsc}</div><div>{T("Account No")}: {bk.acc}</div>{bk.customerId && <div>{T("Customer ID")}: {bk.customerId}</div>}{bk.bank && <div>{T("Bank")}: {bk.bank}</div>}</div>;
  const shipName = inv.shipSame ? inv.cust.name : inv.ship.name, shipAddr = inv.shipSame ? inv.cust.address : inv.ship.address;

  return (
    <div className={`paper${inv.status === "cancelled" ? " cancelled" : ""}`}>
      <div className="pbox">
        {(inv.heading ?? DEFAULT_HEADING).trim() && <h2 className="p-title">{(inv.heading ?? DEFAULT_HEADING).trim()}</h2>}
        <div className="p-head">
          <div className="p-biz"><b>{b.name}</b>{b.address}<br />{b.mobile && <>{T("Mobile")} : {b.mobile}<br /></>}{b.gstin && <>{T("GSTIN")} : {b.gstin}<br /></>}{b.pan && <>{T("PAN Number")} : {b.pan}</>}</div>
          <div className="p-meta">
            {label && <div className="t"><span className="p-copy">{label}</span></div>}
            <div className="kv"><span>{T("Invoice No.")}</span><span>{inv.no}</span></div>
            <div className="kv"><span>{T("Invoice Date")}</span><span>{dmy(inv.date)}</span></div>
            {inv.due && <div className="kv"><span>{T("Due Date")}</span><span>{dmy(inv.due)}</span></div>}
          </div>
        </div>
        <div className="p-parties">
          <div className="p-party"><div className="p-bar">{T("BILL TO")}</div><div className="bd"><b>{inv.cust.name}</b>{inv.cust.address}<br />{inv.cust.mobile && <>{T("Mobile")} : {inv.cust.mobile}<br /></>}{inv.cust.gstin && <>{T("GSTIN")} : {inv.cust.gstin}<br /></>}{inv.cust.pan && <>{T("PAN Number")} : {inv.cust.pan}<br /></>}{T("Place of Supply")} : {inv.pos}</div></div>
          <div className="p-party"><div className="p-bar">{T("SHIP TO")}</div><div className="bd"><b>{shipName}</b>{shipAddr}</div></div>
        </div>
        <div className="p-items">
          <div className="r rh" style={g}><div className="c">{T("S.NO.")}</div><div className="c">{T("ITEMS")}</div><div className="c">{T("HSN")}</div><div className="c n">{T("QTY.")}</div><div className="c n">{T("RATE")}</div>{showDisc && <div className="c n">{T("DISC.")}</div>}<div className="c n">{T("TAX")}</div><div className="c n">{T("AMOUNT")}</div></div>
          {k > 0 && <div className="r rs carry" style={g}><div className="c"></div><div className="c">{T("BROUGHT FORWARD")} <small>{T("Page")} {k === 1 ? "1" : `1–${k}`}</small></div><div className="c"></div><div className="c"></div><div className="c"></div>{showDisc && <div className="c"></div>}<div className="c n">₹{plain(carry?.tax ?? 0)}</div><div className="c n">₹{plain(carry?.amount ?? 0)}</div></div>}
          <div className="p-body">
            {ch.map((i) => {
              const l = inv.lines[i], r = c.rows[i];
              return (
                <div className="r" style={g} key={i}>
                  <div className="c">{i + 1}</div><div className="c">{l.name}</div><div className="c">{l.hsn}</div>
                  <div className="c n">{fmtQty(l.qty, l.unit)}</div><div className="c n">{trimNum(l.rate, 2)}{subUnitOf(l.unit) && <small>/{l.unit}</small>}</div>
                  {showDisc && <div className="c n">{N(l.disc) ? trimNum(l.disc, 2) + "%" : ""}</div>}
                  <div className="c n">{plain(r.tax)}<small>({trimNum(l.gst, 2)}%)</small></div><div className="c n">{plain(r.amount)}</div>
                </div>
              );
            })}
          </div>
          {last && <div className="r rs" style={g}><div className="c"></div><div className="c">{n > 1 ? T("SUBTOTAL (ALL PAGES)") : T("SUBTOTAL")}</div><div className="c"></div><div className="c n">{new Set(inv.lines.map((l) => l.unit)).size === 1 ? trimNum(c.qty, 2) : ""}</div><div className="c"></div>{showDisc && <div className="c"></div>}<div className="c n">₹{plain(c.tax)}</div><div className="c n">₹{plain(c.total)}</div></div>}
        </div>
        {!last && (
          <div className="p-foot cont">
            <div className="l">{bankBlock}</div>
            <div className="rr"><div className="p-contnote">{T("Continued on next page")}</div></div>
          </div>
        )}
        {last && (
          <div className="p-foot">
            <div className="l">
              {bankBlock}
              {inv.notes && <div className="sec"><h4>{T("NOTES")}</h4><pre>{inv.notes}</pre></div>}
              {settings.terms && <div className="sec"><h4>{T("TERMS AND CONDITIONS")}</h4><pre>{settings.terms}</pre></div>}
            </div>
            <div className="rr">
              <div className="p-tot">
                <div><span>{T("Taxable Amount")}</span><span>₹{plain(c.taxable)}</span></div>
                {taxRows}
                {c.roundOff !== 0 && <div><span>{T("Round Off")}</span><span>{c.roundOff < 0 ? "-" : ""}₹{plain(Math.abs(c.roundOff))}</span></div>}
                <div className="g"><span>{T("Total Amount")}</span><span>₹{plain(c.grand)}</span></div>
                <div><span>{T("Received Amount")}</span><span>₹{plain(paid)}</span></div>
                {paid > 0 && bal > 0.004 && <div><span>{T("Balance Due")}</span><span>₹{plain(bal)}</span></div>}
                <div style={{ marginTop: 4 }}><span>{T("Total Amount (in words)")}</span></div>
                <span className="w">{inWords(c.grand)}</span>
              </div>
              <div className="p-sign">{(lang === "ta" || !settings.signLabel) ? T("Authorised Signature for") : settings.signLabel} {b.name}</div>
            </div>
          </div>
        )}
      </div>
      {n > 1 && <div className="p-page">{T("Page")} {k + 1} {T("of")} {n}</div>}
    </div>
  );
}
