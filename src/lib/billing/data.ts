import { N, calcInvoice, qtyByItem, round3, todayISO, trimNum } from "./calc";
import type { BillingData, Invoice, Item } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export function defaults(): BillingData {
  return {
    v: 1,
    settings: {
      biz: { name: "", address: "", mobile: "", gstin: "", pan: "", state: "Tamil Nadu" },
      bank: { holder: "", ifsc: "", acc: "", bank: "" },
      prefix: "", nextNo: 1, dueDays: 7, notes: "",
      terms: "1. Goods once sold will not be taken back or exchanged\n2. All disputes are subject to local jurisdiction only",
      signLabel: "Authorised Signature for", allowNegative: false, roundOff: false,
    },
    items: [], customers: [], invoices: [], ledger: [],
    meta: { lastBackup: null, sampleNote: false },
  };
}

/** Fills any missing fields so data saved by older versions (or restored from a backup) always has the full shape. */
export function migrate(d: Partial<BillingData>): BillingData {
  const df = defaults();
  return {
    ...df, ...d,
    settings: { ...df.settings, ...d.settings, biz: { ...df.settings.biz, ...d.settings?.biz }, bank: { ...df.settings.bank, ...d.settings?.bank } },
    meta: { ...df.meta, ...d.meta },
    items: d.items || [], customers: d.customers || [], invoices: d.invoices || [], ledger: d.ledger || [],
  } as BillingData;
}

export const itemById = (db: BillingData, id: string) => db.items.find((i) => i.id === id);
export const custById = (db: BillingData, id: string) => db.customers.find((c) => c.id === id);
export const invById = (db: BillingData, id: string) => db.invoices.find((i) => i.id === id);
export const isIntra = (db: BillingData, pos: string) =>
  String(pos || "").trim().toLowerCase() === String(db.settings.biz.state || "").trim().toLowerCase();
export const nextNoStr = (db: BillingData) => (db.settings.prefix || "") + db.settings.nextNo;
export function bumpNext(db: BillingData, no: string) {
  const m = /(\d+)$/.exec(no);
  if (m && Number(m[1]) >= db.settings.nextNo) db.settings.nextNo = Number(m[1]) + 1;
}
export const isLow = (i: Item) => i.stock <= 0 || (i.low > 0 && i.stock <= i.low);

/* The functions below mutate the BillingData they are given. Call them on a copy (see BillingProvider.update). */
export function moveStock(db: BillingData, it: Item, delta: number, type: import("./types").MoveType, ref?: string, note?: string, date?: string) {
  it.stock = round3(it.stock + delta);
  db.ledger.push({ id: uid(), ts: Math.max(Date.now(), (db.ledger[db.ledger.length - 1]?.ts ?? 0) + 1), date: date || todayISO(), itemId: it.id, name: it.name, qty: round3(delta), type, ref: ref || "", note: note || "", bal: it.stock });
}

export function stockProblems(db: BillingData, lines: Invoice["lines"], old?: Invoice | null) {
  const nm = qtyByItem(lines), om = old ? qtyByItem(old.lines) : {}, out: string[] = [];
  for (const id in nm) {
    const it = itemById(db, id);
    if (!it) continue;
    const avail = round3(it.stock + (om[id] || 0));
    if (nm[id] > avail + 1e-9)
      out.push(`${it.name}: billing ${trimNum(nm[id], 3)} ${it.unit} but only ${trimNum(Math.max(avail, 0), 3)} ${it.unit} in stock. Add stock first, or allow negative stock in Settings.`);
  }
  return out;
}

export function applyStock(db: BillingData, inv: Invoice, old?: { lines: Invoice["lines"] } | null) {
  const nm = qtyByItem(inv.lines), om = old ? qtyByItem(old.lines) : {};
  new Set([...Object.keys(nm), ...Object.keys(om)]).forEach((id) => {
    const it = itemById(db, id);
    if (!it) return;
    const d = round3((nm[id] || 0) - (om[id] || 0));
    if (d !== 0) moveStock(db, it, -d, old ? "EDIT" : "SALE", inv.no, old ? "Invoice edited" : inv.cust.name, inv.date);
  });
}

/** Sample data taken from the original bill no. 49, so a new account is not empty. */
export function seed(): BillingData {
  const db = defaults(), s = db.settings;
  Object.assign(s.biz, { name: "Sri Angalaeshwari Traders", address: "17/A Sudu Thanni Wayakal Road, Thevar Pettai, Ponnagram, Madurai, Tamil Nadu", mobile: "9940710309", gstin: "33QBSPS1659N1ZE", pan: "QBSPS1659N", state: "Tamil Nadu" });
  Object.assign(s.bank, { holder: "SRI ANGALAESWARI TRADERS", ifsc: "SBIN0000869", acc: "44511788356", bank: "State Bank of India, MADURAI" });
  s.terms = "1. Goods once sold will not be taken back or exchanged\n2. All disputes are subject to Madurai jurisdiction only";
  const mk = (name: string, alt: string, hsn: string, unit: string, rate: number, gst: number, open: number, low: number) => {
    const it: Item = { id: uid(), name, alt, hsn, unit, rate, gst, low, stock: 0, active: true };
    db.items.push(it);
    moveStock(db, it, open, "OPENING", "", "Sample opening stock", "2026-08-31");
    return it;
  };
  const a = mk("ஊறுகாய்", "Pickle", "2001", "KGS", 94, 5, 50, 10);
  const b = mk("ரசம் பொடி", "Rasam powder", "0910", "KGS", 552, 5, 25, 5);
  const c = mk("ரீஃபில் பேனா", "Refill pen", "9608", "NOS", 9.44, 0, 500, 50);
  const cu = { id: uid(), name: "THE MADURAI DISTRICT PANDIAN CONSUMERS CO OPERATIVE WHOLE SALE STORES LTD", address: "216 A, EXTENSION ZONE -1, P P NAGAR, MADURAI, Madurai, Tamil Nadu, Madurai, Tamil Nadu, 625016", mobile: "9843230297", gstin: "33AAAAT0957C1ZW", pan: "AAAAT0957C", state: "Tamil Nadu" };
  db.customers.push(cu);
  const lines = ([[a, 0.162], [b, 0.105], [c, 6]] as [Item, number][]).map(([it, q]) => ({ itemId: it.id, name: it.name, hsn: it.hsn, unit: it.unit, qty: q, rate: it.rate, disc: 0, gst: it.gst }));
  const inv: Invoice = { id: uid(), no: "49", date: "2026-09-01", due: "2026-09-08", custId: cu.id, cust: { name: cu.name, address: cu.address, mobile: cu.mobile, gstin: cu.gstin, pan: cu.pan }, shipSame: true, ship: { name: "", address: "" }, pos: "Tamil Nadu", intra: true, roundOffOn: false, lines, notes: "தேவர் பயிற்சி பள்ளி", payments: [], status: "active", createdAt: Date.now() - 1e3, grand: 0 };
  inv.grand = calcInvoice(lines, true, false).grand;
  db.invoices.push(inv);
  applyStock(db, inv, null);
  s.nextNo = 50; db.meta.sampleNote = true;
  return db;
}

export { N };
