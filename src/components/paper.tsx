import { Fragment } from "react";
import { N, dmy, fmtQty, inWords, invPaid, plain, round2, subUnitOf, totalsOf, trimNum } from "@/lib/billing/calc";
import { DEFAULT_HEADING, FULLROWS, LASTROWS } from "@/lib/billing/constants";
import { sellerOfInvoice } from "@/lib/billing/data";
import type { BillingData, Invoice } from "@/lib/billing/types";

type Totals = ReturnType<typeof totalsOf>;

export function Paper({ inv, settings, label }: { inv: Invoice; settings: BillingData["settings"]; label: string }) {
  const c = totalsOf(inv), showDisc = inv.lines.some((l) => N(l.disc) > 0);
  const cols = showDisc ? "8% 29% 9% 14% 10% 8% 11% 11%" : "8% 32% 10% 14% 11% 12% 13%";
  const rest = inv.lines.map((_, i) => i), chunks: number[][] = [];
  while (rest.length > LASTROWS) chunks.push(rest.splice(0, Math.min(FULLROWS, rest.length - 1)));
  chunks.push(rest);
  return <>{chunks.map((ch, k) => <Page key={k} {...{ inv, settings, c, label, ch, k, n: chunks.length, cols, showDisc }} />)}</>;
}

function Page({ inv, settings, c, label, ch, k, n, cols, showDisc }: {
  inv: Invoice; settings: BillingData["settings"]; c: Totals; label: string; ch: number[]; k: number; n: number; cols: string; showDisc: boolean;
}) {
  const seller = sellerOfInvoice(settings, inv), b = seller.biz, bk = seller.bank, last = k === n - 1, g = { gridTemplateColumns: cols };
  const paid = invPaid(inv), bal = round2(inv.grand - paid), hasBank = bk.acc || bk.ifsc || bk.holder || bk.customerId;
  const taxRows = c.intra
    ? c.groups.map((x) => (<Fragment key={x.rate}><div><span>CGST @{trimNum(x.rate / 2, 3)}%</span><span>₹{plain(x.cgst)}</span></div><div><span>SGST @{trimNum(x.rate / 2, 3)}%</span><span>₹{plain(x.sgst)}</span></div></Fragment>))
    : c.groups.map((x) => <div key={x.rate}><span>IGST @{trimNum(x.rate, 2)}%</span><span>₹{plain(x.tax)}</span></div>);
  const shipName = inv.shipSame ? inv.cust.name : inv.ship.name, shipAddr = inv.shipSame ? inv.cust.address : inv.ship.address;

  return (
    <div className={`paper${inv.status === "cancelled" ? " cancelled" : ""}`}>
      <div className="pbox">
        {(inv.heading ?? DEFAULT_HEADING).trim() && <h2 className="p-title">{(inv.heading ?? DEFAULT_HEADING).trim()}</h2>}
        <div className="p-head">
          <div className="p-biz"><b>{b.name}</b>{b.address}<br />{b.mobile && <>Mobile : {b.mobile}<br /></>}{b.gstin && <>GSTIN : {b.gstin}<br /></>}{b.pan && <>PAN Number : {b.pan}</>}</div>
          <div className="p-meta">
            {label && <div className="t"><span className="p-copy">{label}</span></div>}
            <div className="kv"><span>Invoice No.</span><span>{inv.no}</span></div>
            <div className="kv"><span>Invoice Date</span><span>{dmy(inv.date)}</span></div>
            {inv.due && <div className="kv"><span>Due Date</span><span>{dmy(inv.due)}</span></div>}
          </div>
        </div>
        <div className="p-parties">
          <div className="p-party"><div className="p-bar">BILL TO</div><div className="bd"><b>{inv.cust.name}</b>{inv.cust.address}<br />{inv.cust.mobile && <>Mobile : {inv.cust.mobile}<br /></>}{inv.cust.gstin && <>GSTIN : {inv.cust.gstin}<br /></>}{inv.cust.pan && <>PAN Number : {inv.cust.pan}<br /></>}Place of Supply : {inv.pos}</div></div>
          <div className="p-party"><div className="p-bar">SHIP TO</div><div className="bd"><b>{shipName}</b>{shipAddr}</div></div>
        </div>
        <div className="p-items">
          <div className="r rh" style={g}><div className="c">S.NO.</div><div className="c">ITEMS</div><div className="c">HSN</div><div className="c n">QTY.</div><div className="c n">RATE</div>{showDisc && <div className="c n">DISC.</div>}<div className="c n">TAX</div><div className="c n">AMOUNT</div></div>
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
          {last
            ? <div className="r rs" style={g}><div className="c"></div><div className="c">SUBTOTAL</div><div className="c"></div><div className="c n">{new Set(inv.lines.map((l) => l.unit)).size === 1 ? trimNum(c.qty, 2) : ""}</div><div className="c"></div>{showDisc && <div className="c"></div>}<div className="c n">₹{plain(c.tax)}</div><div className="c n">₹{plain(c.total)}</div></div>
            : <div className="p-cont">Continued on next page</div>}
        </div>
        {last && (
          <div className="p-foot">
            <div className="l">
              {hasBank && <div className="sec"><h4>BANK DETAILS</h4><div>Name: {bk.holder}</div><div>IFSC Code: {bk.ifsc}</div><div>Account No: {bk.acc}</div>{bk.customerId && <div>Customer ID: {bk.customerId}</div>}{bk.bank && <div>Bank: {bk.bank}</div>}</div>}
              {inv.notes && <div className="sec"><h4>NOTES</h4><pre>{inv.notes}</pre></div>}
              {settings.terms && <div className="sec"><h4>TERMS AND CONDITIONS</h4><pre>{settings.terms}</pre></div>}
            </div>
            <div className="rr">
              <div className="p-tot">
                <div><span>Taxable Amount</span><span>₹{plain(c.taxable)}</span></div>
                {taxRows}
                {c.roundOff !== 0 && <div><span>Round Off</span><span>{c.roundOff < 0 ? "-" : ""}₹{plain(Math.abs(c.roundOff))}</span></div>}
                <div className="g"><span>Total Amount</span><span>₹{plain(c.grand)}</span></div>
                <div><span>Received Amount</span><span>₹{plain(paid)}</span></div>
                {paid > 0 && bal > 0.004 && <div><span>Balance Due</span><span>₹{plain(bal)}</span></div>}
                <div style={{ marginTop: 4 }}><span>Total Amount (in words)</span></div>
                <span className="w">{inWords(c.grand)}</span>
              </div>
              <div className="p-sign">{settings.signLabel || "Authorised Signature for"} {b.name}</div>
            </div>
          </div>
        )}
      </div>
      {n > 1 && <div className="p-page">Page {k + 1} of {n}</div>}
    </div>
  );
}
