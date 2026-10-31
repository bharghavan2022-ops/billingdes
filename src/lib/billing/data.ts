import { DEFAULT_HEADING } from "./constants";
import { N, calcInvoice, qtyByItem, round3, todayISO, trimNum } from "./calc";
import { CATALOGUE, CATALOGUE_SIZE } from "./catalogue";
import type { BankDetails, BillingData, BusinessDetails, Invoice, Item, Seller, Settings } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export const SRI_ID = "sri";
export const VELAN_ID = "velan";
export const VELAN_ACC = "24970200003412";
/** The account number first entered for VELAN & CO, with one digit too many. Saved accounts that still hold it are corrected once. */
const VELAN_ACC_OLD = "249702000003412";

const blankBiz = (): BusinessDetails => ({ name: "", address: "", mobile: "", gstin: "", pan: "", state: "Tamil Nadu" });
const blankBank = (): BankDetails => ({ holder: "", ifsc: "", acc: "", bank: "", customerId: "" });

/** Starting Tamil names and addresses for the two firms; editable in Settings. */
const TAMIL_DEFAULTS: Record<string, { nameTa: string; addressTa: string }> = {
  [SRI_ID]: { nameTa: "ஸ்ரீ அங்காளேஸ்வரி டிரேடர்ஸ்", addressTa: "17/A சுடுதண்ணி வாய்க்கால் சாலை, தேவர்பேட்டை, பொன்னகரம், மதுரை, தமிழ்நாடு" },
  [VELAN_ID]: { nameTa: "வேலன் அண்ட் கோ", addressTa: "பிளாட் எண் 17A, ஹாட் வாட்டர் சேனல் சாலை, பொன்னகரம், மதுரை - 625016." },
};

export const fillSeller = (s: Partial<Seller> & { id: string }): Seller => ({
  id: s.id, biz: { ...blankBiz(), ...TAMIL_DEFAULTS[s.id], ...s.biz }, bank: { ...blankBank(), ...s.bank }, prefix: s.prefix ?? "", nextNo: s.nextNo && s.nextNo > 0 ? s.nextNo : 1, numbering: s.numbering === "simple" ? "simple" : "series",
});

export const defaultSri = (): Seller => fillSeller({ id: SRI_ID, biz: { ...blankBiz(), name: "Sri Angalaeshwari Traders" } });
export const defaultVelan = (): Seller => fillSeller({
  id: VELAN_ID, prefix: "VC-", nextNo: 1,
  biz: { name: "VELAN & CO", address: "Flat No.17A, Hot Water Channel Road, Ponnagaram, Madurai - 625016.", mobile: "", gstin: "33EKOPS1500P1ZR", pan: "EKOPS1500P", state: "Tamil Nadu" },
  bank: { holder: "VELAN & CO", ifsc: "FDRL0002497", acc: VELAN_ACC, bank: "Federal Bank", customerId: "152402872" },
});

export function defaults(): BillingData {
  return {
    v: 1,
    settings: {
      sellers: [defaultSri(), defaultVelan()], sellerId: SRI_ID,
      dueDays: 7, notes: "",
      terms: "1. Goods once sold will not be taken back or exchanged\n2. All disputes are subject to local jurisdiction only",
      signLabel: "Authorised Signature for", allowNegative: false, roundOff: false, trackStock: false,
    },
    items: [], customers: [], invoices: [], ledger: [],
    meta: { lastBackup: null, sampleNote: false, numbersReset: false },
  };
}

type LegacySettings = Partial<Omit<Settings, "sellers">> & {
  sellers?: Partial<Seller>[]; biz?: Partial<BusinessDetails>; bank?: Partial<BankDetails>; prefix?: string; nextNo?: number;
};

/**
 * Brings saved settings up to the current shape. Data saved before there were two firms (a single business, bank, prefix and next number)
 * becomes the first seller, and VELAN & CO is added as the second.
 */
export function normalizeSettings(raw: unknown): Settings {
  const df = defaults().settings;
  const { biz, bank, prefix, nextNo, sellers: rawSellers, ...rest } = (raw ?? {}) as LegacySettings;
  const sellers: Seller[] = Array.isArray(rawSellers) && rawSellers.length
    ? rawSellers.map((s, i) => fillSeller({ ...s, id: s.id || (i === 0 ? SRI_ID : uid()) }))
    : [fillSeller({ id: SRI_ID, biz: { ...blankBiz(), ...(biz ?? {}) }, bank: { ...blankBank(), ...(bank ?? {}) }, prefix, nextNo }), defaultVelan()];
  const sellerId = sellers.some((s) => s.id === rest.sellerId) ? (rest.sellerId as string) : sellers[0].id;
  return { ...df, ...rest, sellers, sellerId };
}

/** Fills any missing fields so data saved by older versions (or restored from a backup) always has the full shape. */
export function migrate(d: Partial<BillingData>): BillingData {
  const df = defaults();
  const out = {
    ...df, ...d,
    settings: normalizeSettings(d.settings),
    meta: { ...df.meta, ...d.meta },
    items: d.items || [], customers: d.customers || [],
    invoices: (d.invoices || []).map((i) => ({ ...i, sellerId: i.sellerId || "", heading: i.heading ?? DEFAULT_HEADING })), ledger: d.ledger || [],
  } as BillingData;
  ensureItemCodes(out);
  return out;
}

/** The seller with this id, or the default one (older bills have no seller and belong to the first). */
export function sellerOf(settings: Settings, id?: string): Seller {
  return settings.sellers.find((s) => s.id === id) ?? settings.sellers.find((s) => s.id === settings.sellerId) ?? settings.sellers[0];
}
/** The seller a bill belongs to: its own, or the first seller for bills made before there were two. */
export const sellerOfInvoice = (settings: Settings, inv: Pick<Invoice, "sellerId">): Seller =>
  settings.sellers.find((s) => s.id === inv.sellerId) ?? settings.sellers[0];
export const activeSeller = (db: Pick<BillingData, "settings">): Seller => sellerOf(db.settings, db.settings.sellerId);

/** Codes 001-101 are reserved for the catalogue, so new items start at 102 and always continue from the highest code in use. */
export function nextItemCode(db: Pick<BillingData, "items">): string {
  const max = db.items.reduce((m, i) => Math.max(m, /^\d+$/.test(i.code || "") ? Number(i.code) : 0), CATALOGUE_SIZE);
  return String(max + 1).padStart(3, "0");
}

/** Gives every item that has no code the next free one (older data saved before codes existed). */
export function ensureItemCodes(db: BillingData) {
  for (const i of db.items) if (!i.code) i.code = nextItemCode(db);
}

/**
 * Loads the standard catalogue: name, HSN and GST, plus the unit and usual rate for the items that appear on your sales invoices. No stock.
 * An item you already have with the same name keeps its details and takes the catalogue code. Catalogue items loaded earlier without
 * HSN/GST (or still at the default unit and a zero rate) get those filled in. Safe to run more than once.
 */
export function addCatalogueItems(db: BillingData): { added: number; linked: number; filled: number } {
  const reserved = new Set(CATALOGUE.map((c) => c.code));
  let added = 0, linked = 0, filled = 0;
  const fill = (it: Item, c: (typeof CATALOGUE)[number]) => {
    let did = false;
    if (!it.hsn && !N(it.gst) && c.hsn) { it.hsn = c.hsn; it.gst = c.gst; did = true; }
    if (c.rate !== undefined && !N(it.rate) && it.unit === "NOS") { it.rate = c.rate; it.unit = c.unit || it.unit; did = true; }
    return did;
  };
  for (const c of CATALOGUE) {
    const byCode = db.items.find((i) => i.code === c.code);
    if (byCode) { if (fill(byCode, c)) filled++; continue; }
    const same = db.items.find((i) => i.name.trim().toLowerCase() === c.name.trim().toLowerCase() && !reserved.has(i.code));
    if (same) { same.code = c.code; fill(same, c); linked++; continue; }
    db.items.push({ id: uid(), code: c.code, name: c.name, alt: c.english, hsn: c.hsn, unit: c.unit || "NOS", rate: c.rate ?? 0, gst: c.gst, low: 0, stock: 0, active: true });
    added++;
  }
  return { added, linked, filled };
}

/**
 * Fills blanks on the standard items already in the account, never overwriting anything: HSN and GST where both are empty, and the
 * unit and rate (from your sales invoices) where the rate is 0 and the unit is still the default NOS. Adds no items. Returns how many changed.
 */
export function fillCatalogueBlanks(db: BillingData): number {
  const byCode = new Map(CATALOGUE.map((c) => [c.code, c]));
  const byName = new Map<string, (typeof CATALOGUE)[number]>();
  for (const c of CATALOGUE) { byName.set(c.name.trim(), c); byName.set(c.english.trim().toLowerCase(), c); }
  let n = 0;
  for (const it of db.items) {
    const c = byCode.get(it.code) || byName.get(it.name.trim()) || byName.get(it.name.trim().toLowerCase());
    if (!c) continue;
    let did = false;
    if (!it.hsn && !N(it.gst) && c.hsn) { it.hsn = c.hsn; it.gst = c.gst; did = true; }
    if (c.rate !== undefined && !N(it.rate)) { it.rate = c.rate; if (!it.unit || it.unit === "NOS") it.unit = c.unit || it.unit; did = true; }
    if (did) n++;
  }
  return n;
}

/** The 65 catalogue items backed by your sales invoices (they carry a unit and rate). */
const INVOICE_BACKED = CATALOGUE.filter((c) => c.rate !== undefined);
const OLD_075 = (name: string) => name.startsWith("வெண்சுண்டல் (");
const differs = (it: Item, c: (typeof CATALOGUE)[number]) =>
  it.hsn !== c.hsn || N(it.gst) !== c.gst || it.unit !== c.unit || N(it.rate) !== c.rate || (c.code === "075" && OLD_075(it.name));

/** Items whose HSN, GST, unit or rate differ from your sales invoices. */
export function itemsDifferingFromInvoices(db: Pick<BillingData, "items">): Item[] {
  const byCode = new Map(db.items.map((i) => [i.code, i]));
  return INVOICE_BACKED.flatMap((c) => { const it = byCode.get(c.code); return it && differs(it, c) ? [it] : []; });
}

/** Sets HSN, GST, unit and default rate of those items to the values on your sales invoices (overwrites). Returns how many changed. */
export function applyInvoiceRates(db: BillingData): number {
  let n = 0;
  const byCode = new Map(db.items.map((i) => [i.code, i]));
  for (const c of INVOICE_BACKED) {
    const it = byCode.get(c.code);
    if (!it || !differs(it, c)) continue;
    it.hsn = c.hsn; it.gst = c.gst; it.unit = c.unit as string; it.rate = c.rate as number;
    if (c.code === "075" && OLD_075(it.name)) { it.name = c.name; it.alt = c.english; }
    n++;
  }
  return n;
}

/** True when the standard list has not been loaded, or loaded items are still missing their HSN/GST. */
export function catalogueNeedsLoading(db: Pick<BillingData, "items">): boolean {
  const byCode = new Map(db.items.map((i) => [i.code, i]));
  return CATALOGUE.some((c) => {
    const it = byCode.get(c.code);
    return !it || (!it.hsn && !N(it.gst) && !!c.hsn);
  });
}

export const itemById = (db: BillingData, id: string) => db.items.find((i) => i.id === id);
export const custById = (db: BillingData, id: string) => db.customers.find((c) => c.id === id);
export const invById = (db: BillingData, id: string) => db.invoices.find((i) => i.id === id);
/** Within the seller's own state the tax is CGST + SGST, otherwise IGST. */
export const isIntra = (db: Pick<BillingData, "settings">, pos: string, sellerId?: string) =>
  String(pos || "").trim().toLowerCase() === String(sellerOf(db.settings, sellerId).biz.state || "").trim().toLowerCase();
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pad2 = (n: number) => String(n).padStart(2, "0");
/** Splits a 4-digit number into its series (first two digits) and part (last two), after the firm's prefix. */
export function parseSeriesNo(no: string, prefix: string): { series: number; part: number } | null {
  const m = new RegExp("^" + escRe(prefix || "") + "(\\d{2})(\\d{2})$").exec(String(no || "").trim());
  return m ? { series: Number(m[1]), part: Number(m[2]) } : null;
}
export const fmtSeriesNo = (prefix: string, series: number, part: number) => (prefix || "") + pad2(series) + pad2(part);

export interface SeriesPlan {
  /** Series of the firm's latest bill; null when it has no 4-digit bills yet. */
  current: number | null;
  /** Number of the latest bill, so the same number can be used again. */
  lastNo: string;
  /** Next part of the current series (0501 -> 0502); null when the series is full (99). */
  continueNo: string | null;
  /** First part of a brand new series (0501 -> 0601); null when there is no room left. */
  newNo: string | null;
}
/** What the "same series" and "new series" choices would number the next bill. Worked out from the saved bills, so it can never drift. */
export function seriesPlan(db: Pick<BillingData, "settings" | "invoices">, sellerId?: string, exceptId?: string): SeriesPlan {
  const s = sellerOf(db.settings, sellerId), prefix = s.prefix || "";
  const mine = db.invoices.filter((i) => i.id !== exceptId && sellerOfInvoice(db.settings, i).id === s.id)
    .map((i) => ({ i, p: parseSeriesNo(i.no, prefix) })).filter((x): x is { i: Invoice; p: { series: number; part: number } } => !!x.p);
  if (!mine.length) return { current: null, lastNo: "", continueNo: fmtSeriesNo(prefix, 1, 1), newNo: fmtSeriesNo(prefix, 1, 1) };
  const last = mine.reduce((a, b) => (b.i.createdAt >= a.i.createdAt ? b : a));
  const cur = last.p.series;
  const maxPart = Math.max(...mine.filter((x) => x.p.series === cur).map((x) => x.p.part));
  const maxSeries = Math.max(...mine.map((x) => x.p.series));
  return {
    current: cur, lastNo: last.i.no,
    continueNo: maxPart < 99 ? fmtSeriesNo(prefix, cur, maxPart + 1) : null,
    newNo: maxSeries < 99 ? fmtSeriesNo(prefix, maxSeries + 1, 1) : null,
  };
}

export const nextNoStr = (db: Pick<BillingData, "settings" | "invoices">, sellerId?: string) => {
  const s = sellerOf(db.settings, sellerId);
  if (s.numbering !== "simple") { const p = seriesPlan(db, sellerId); return p.continueNo ?? p.newNo ?? (s.prefix || "") + s.nextNo; }
  return (s.prefix || "") + s.nextNo;
};
export function bumpNext(db: BillingData, no: string, sellerId?: string) {
  const s = sellerOf(db.settings, sellerId);
  if (s.numbering !== "simple") return; // series numbers are worked out from the saved bills
  const m = /(\d+)$/.exec(no);
  if (m && Number(m[1]) >= s.nextNo) s.nextNo = Number(m[1]) + 1;
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
export function seed(sample = true): BillingData {
  const db = defaults(), s = db.settings;
  const sri = s.sellers[0];
  Object.assign(sri.biz, { name: "Sri Angalaeshwari Traders", address: "17/A Sudu Thanni Wayakal Road, Thevar Pettai, Ponnagram, Madurai, Tamil Nadu", mobile: "9940710309", gstin: "33QBSPS1659N1ZE", pan: "QBSPS1659N", state: "Tamil Nadu" });
  Object.assign(sri.bank, { holder: "SRI ANGALAESWARI TRADERS", ifsc: "SBIN0000869", acc: "44511788356", bank: "State Bank of India, MADURAI" });
  s.terms = "1. Goods once sold will not be taken back or exchanged\n2. All disputes are subject to Madurai jurisdiction only";
  if (!sample) { db.meta.numbersReset = true; return db; }
  const mk = (name: string, alt: string, hsn: string, unit: string, rate: number, gst: number, open: number, low: number) => {
    const it: Item = { id: uid(), code: nextItemCode(db), name, alt, hsn, unit, rate, gst, low, stock: 0, active: true };
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
  const inv: Invoice = { id: uid(), no: "49", date: "2026-09-01", due: "2026-09-08", sellerId: SRI_ID, custId: cu.id, cust: { name: cu.name, address: cu.address, mobile: cu.mobile, gstin: cu.gstin, pan: cu.pan }, shipSame: true, ship: { name: "", address: "" }, pos: "Tamil Nadu", intra: true, roundOffOn: false, lines, heading: DEFAULT_HEADING, lang: "en", notes: "தேவர் பயிற்சி பள்ளி", payments: [], status: "active", createdAt: Date.now() - 1e3, grand: 0 };
  inv.grand = calcInvoice(lines, true, false).grand;
  db.invoices.push(inv);
  applyStock(db, inv, null);
  sri.nextNo = 50; db.meta.sampleNote = true;
  return db;
}

export { N };

/** One-time reset: both firms start their invoice numbers again from 1. Returns true when it changed anything. */
export function resetNumbering(db: BillingData): boolean {
  if (db.meta.numbersReset) return false;
  db.meta.numbersReset = true;
  for (const sl of db.settings.sellers) sl.nextNo = 1;
  return true;
}

/** Corrects known wrong details in saved settings, without touching anything the user has since changed. Returns true when it changed something. */
export function correctKnownDetails(db: BillingData): boolean {
  const v = db.settings.sellers.find((x) => x.id === VELAN_ID);
  if (v && v.bank.acc === VELAN_ACC_OLD) { v.bank.acc = VELAN_ACC; return true; }
  return false;
}
