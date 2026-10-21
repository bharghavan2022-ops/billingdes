import type { Invoice, Line, SubUnit } from "./types";

export const round2 = (x: number) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
export const round3 = (x: number) => Math.round((Number(x) + Number.EPSILON) * 1000) / 1000;
export function N(v: unknown): number {
  const n = parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

/**
 * Rates are per 1 kg (or per 1 litre). A weight can be typed in grams (a volume in millilitres): it is divided by 1000, so
 * 250 g at Rs 124/kg is 0.25 kg = Rs 31, and 2.5 kg is Rs 310. Quantity and amount always scale in proportion.
 */
export function subUnitOf(unit: string): SubUnit | null {
  const u = String(unit || "").trim().toUpperCase();
  if (u === "KGS" || u === "KG") return "g";
  if (u === "LTR" || u === "LTRS" || u === "L") return "ml";
  return null;
}
/** The quantity in the item's own unit (kg or litre), whichever unit it was typed in. */
export const baseQty = (l: { qty: unknown; qtyUnit?: SubUnit }) => N(l.qty) / (l.qtyUnit ? 1000 : 1);

export function calcLine(l: Pick<Line, "qty" | "rate" | "disc" | "gst" | "qtyUnit">) {
  const qty = baseQty(l), rate = N(l.rate), gst = N(l.gst);
  const disc = Math.min(100, Math.max(0, N(l.disc)));
  const gross = round2(qty * rate);
  const discAmt = round2((gross * disc) / 100);
  const taxable = round2(gross - discAmt);
  const tax = round2((taxable * gst) / 100);
  return { gross, discAmt, taxable, tax, amount: round2(taxable + tax) };
}

export interface TaxGroup { rate: number; taxable: number; tax: number; cgst: number; sgst: number }
export function calcInvoice(lines: Line[], intra: boolean, roundOff: boolean) {
  let qty = 0, taxable = 0, tax = 0, disc = 0;
  const rows: ReturnType<typeof calcLine>[] = [];
  const by: Record<number, { taxable: number; tax: number }> = {};
  for (const l of lines) {
    const c = calcLine(l);
    rows.push(c);
    qty += baseQty(l); taxable += c.taxable; tax += c.tax; disc += c.discAmt;
    const g = N(l.gst);
    if (g > 0) {
      if (!by[g]) by[g] = { taxable: 0, tax: 0 };
      by[g].taxable += c.taxable; by[g].tax += c.tax;
    }
  }
  taxable = round2(taxable); tax = round2(tax);
  const groups: TaxGroup[] = Object.keys(by).map(Number).sort((a, b) => a - b).map((g) => {
    const t = round2(by[g].tax), half = round2(t / 2);
    return { rate: g, taxable: round2(by[g].taxable), tax: t, cgst: half, sgst: round2(t - half) };
  });
  const total = round2(taxable + tax);
  let grand = total, ro = 0;
  if (roundOff) { grand = Math.round(total); ro = round2(grand - total); }
  return { rows, qty: round2(qty), taxable, tax, disc: round2(disc), groups, total, roundOff: ro, grand, intra: !!intra };
}
export const totalsOf = (inv: Pick<Invoice, "lines" | "intra" | "roundOffOn">) =>
  calcInvoice(inv.lines, inv.intra, inv.roundOffOn);

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const below100 = (n: number): string => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""));
const below1000 = (n: number): string => {
  const h = Math.floor(n / 100), r = n % 100;
  return (h ? ONES[h] + " Hundred" + (r ? " " : "") : "") + (r ? below100(r) : "");
};
export function inWords(amount: number): string {
  const t = Math.round(Math.abs(amount) * 100);
  let n = Math.floor(t / 100);
  const paise = t % 100, parts: string[] = [];
  if (n === 0) parts.push("Zero");
  else {
    const cr = Math.floor(n / 1e7); n %= 1e7;
    const lk = Math.floor(n / 1e5); n %= 1e5;
    const th = Math.floor(n / 1000); n %= 1000;
    if (cr) parts.push(below1000(cr) + " Crore");
    if (lk) parts.push(below100(lk) + " Lakh");
    if (th) parts.push(below100(th) + " Thousand");
    if (n) parts.push(below1000(n));
  }
  let s = parts.join(" ") + " Rupees";
  if (paise) s += " and " + below100(paise) + " Paise";
  return s;
}

export const plain = (n: number) =>
  Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n: number) => "₹" + plain(n);
/** How a quantity is printed: under 1 kg as grams (GMS), under 1 litre as millilitres (ML), otherwise in the item's own unit. */
export function fmtQty(qty: number | string, unit: string): string {
  const q = N(qty), sub = subUnitOf(unit);
  if (sub && q > 0 && q < 1) return `${trimNum(round3(q * 1000), 3)} ${sub === "g" ? "GMS" : "ML"}`;
  return `${trimNum(q, 3)} ${unit}`;
}
export const trimNum = (n: number | string, max: number) => String(parseFloat(Number(n).toFixed(max)));

export const isoOf = (d: Date) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export const todayISO = () => isoOf(new Date());
export function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return isoOf(new Date(y, m - 1, d + n));
}
export function dmy(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return d + "/" + m + "/" + y;
}

export function qtyByItem(lines: Line[]) {
  const m: Record<string, number> = {};
  for (const l of lines) {
    if (!l.itemId) continue;
    m[l.itemId] = round3((m[l.itemId] || 0) + baseQty(l));
  }
  return m;
}
export const invPaid = (inv: Pick<Invoice, "payments">) =>
  round2((inv.payments || []).reduce((s, p) => s + N(p.amount), 0));

export function invStatus(inv: Invoice, today: string) {
  if (inv.status === "cancelled") return "cancelled" as const;
  const paid = invPaid(inv), bal = round2(inv.grand - paid);
  if (bal <= 0.004) return "paid" as const;
  const late = !!inv.due && today > inv.due;
  if (paid > 0) return late ? ("overdue" as const) : ("partial" as const);
  return late ? ("overdue" as const) : ("unpaid" as const);
}

export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
