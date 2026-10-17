import { N } from "./calc";
import { defaults } from "./data";
import type { BillingData, Customer, Invoice, Item, Movement, Payment, Settings } from "./types";

/** Tables in dependency order: parents first. Deletes run in reverse order, upserts in this order. */
export const TABLES = ["items", "customers", "invoices", "invoice_lines", "payments", "stock_movements"] as const;
export type TableName = (typeof TABLES)[number];
export type Row = Record<string, string | number | boolean | null>;
export type RowSets = Record<TableName, Map<string, Row>>;

/** Business details, bank details, numbering and flags live in one small row. */
export interface SettingsDoc {
  v: number;
  settings: Settings;
  meta: { lastBackup: number | null; sampleNote: boolean };
}

export interface Changes {
  settings?: SettingsDoc;
  upserts: Partial<Record<TableName, Row[]>>;
  deletes: Partial<Record<TableName, string[]>>;
}

export const emptyRowSets = (): RowSets => ({
  items: new Map(), customers: new Map(), invoices: new Map(), invoice_lines: new Map(), payments: new Map(), stock_movements: new Map(),
});

export const settingsDocOf = (db: BillingData): SettingsDoc => ({
  v: db.v, settings: db.settings, meta: { lastBackup: db.meta.lastBackup, sampleNote: db.meta.sampleNote },
});

const s = (v: unknown) => (v == null ? "" : String(v));

export function toRowSets(db: BillingData): RowSets {
  const out = emptyRowSets();
  for (const i of db.items) out.items.set(i.id, { id: i.id, name: i.name, alt: i.alt, hsn: i.hsn, unit: i.unit, rate: N(i.rate), gst: N(i.gst), low: N(i.low), stock: N(i.stock), active: !!i.active });
  for (const c of db.customers) out.customers.set(c.id, { id: c.id, name: c.name, address: c.address, mobile: c.mobile, gstin: c.gstin, pan: c.pan, state: c.state });
  for (const v of db.invoices) {
    out.invoices.set(v.id, {
      id: v.id, no: v.no, date: v.date || null, due: v.due || null, customer_id: v.custId || null,
      cust_name: v.cust.name, cust_address: v.cust.address, cust_mobile: v.cust.mobile, cust_gstin: v.cust.gstin, cust_pan: v.cust.pan,
      ship_same: !!v.shipSame, ship_name: v.ship.name, ship_address: v.ship.address, pos: v.pos, intra: !!v.intra, round_off_on: !!v.roundOffOn,
      notes: v.notes || "", grand: N(v.grand), status: v.status, created_at: v.createdAt, updated_at: v.updatedAt ?? null, cancelled_at: v.cancelledAt ?? null,
    });
    v.lines.forEach((l, idx) => {
      const id = `${v.id}:${idx}`;
      out.invoice_lines.set(id, { id, invoice_id: v.id, position: idx, item_id: l.itemId || null, name: l.name, hsn: l.hsn, unit: l.unit, qty: N(l.qty), rate: N(l.rate), disc: N(l.disc), gst: N(l.gst) });
    });
    for (const p of v.payments || []) out.payments.set(p.id, { id: p.id, invoice_id: v.id, date: p.date || null, amount: N(p.amount), mode: p.mode, note: p.note || "" });
  }
  for (const m of db.ledger) out.stock_movements.set(m.id, { id: m.id, ts: m.ts, date: m.date || null, item_id: m.itemId || null, name: m.name, qty: N(m.qty), type: m.type, ref: m.ref || "", note: m.note || "", bal: N(m.bal) });
  return out;
}

type Rows = Record<string, unknown>;
export interface LoadedRows {
  settings: SettingsDoc | null;
  items: Rows[]; customers: Rows[]; invoices: Rows[]; invoice_lines: Rows[]; payments: Rows[]; stock_movements: Rows[];
}

/** Rebuilds the in-app data shape from the database rows. */
export function fromRows(r: LoadedRows): BillingData {
  const df = defaults();
  const doc = r.settings;
  const items: Item[] = r.items.map((x) => ({ id: s(x.id), name: s(x.name), alt: s(x.alt), hsn: s(x.hsn), unit: s(x.unit), rate: N(x.rate), gst: N(x.gst), low: N(x.low), stock: N(x.stock), active: !!x.active }));
  const customers: Customer[] = r.customers.map((x) => ({ id: s(x.id), name: s(x.name), address: s(x.address), mobile: s(x.mobile), gstin: s(x.gstin), pan: s(x.pan), state: s(x.state) }));
  const linesBy = new Map<string, Rows[]>(), paysBy = new Map<string, Rows[]>();
  for (const l of r.invoice_lines) { const k = s(l.invoice_id); (linesBy.get(k) ?? linesBy.set(k, []).get(k)!).push(l); }
  for (const p of r.payments) { const k = s(p.invoice_id); (paysBy.get(k) ?? paysBy.set(k, []).get(k)!).push(p); }
  const invoices: Invoice[] = r.invoices.map((x) => {
    const id = s(x.id);
    const lines = (linesBy.get(id) ?? []).sort((a, b) => N(a.position) - N(b.position)).map((l) => ({ itemId: s(l.item_id), name: s(l.name), hsn: s(l.hsn), unit: s(l.unit), qty: N(l.qty), rate: N(l.rate), disc: N(l.disc), gst: N(l.gst) }));
    const payments: Payment[] = (paysBy.get(id) ?? []).map((p) => ({ id: s(p.id), date: s(p.date), amount: N(p.amount), mode: s(p.mode), note: s(p.note) }));
    const inv: Invoice = {
      id, no: s(x.no), date: s(x.date), due: s(x.due), custId: s(x.customer_id),
      cust: { name: s(x.cust_name), address: s(x.cust_address), mobile: s(x.cust_mobile), gstin: s(x.cust_gstin), pan: s(x.cust_pan) },
      shipSame: !!x.ship_same, ship: { name: s(x.ship_name), address: s(x.ship_address) }, pos: s(x.pos), intra: !!x.intra, roundOffOn: !!x.round_off_on,
      lines, notes: s(x.notes), grand: N(x.grand), payments, status: x.status === "cancelled" ? "cancelled" : "active", createdAt: N(x.created_at),
    };
    if (x.updated_at != null) inv.updatedAt = N(x.updated_at);
    if (x.cancelled_at != null) inv.cancelledAt = N(x.cancelled_at);
    return inv;
  }).sort((a, b) => a.createdAt - b.createdAt);
  const ledger: Movement[] = r.stock_movements.map((m) => ({ id: s(m.id), ts: N(m.ts), date: s(m.date), itemId: s(m.item_id), name: s(m.name), qty: N(m.qty), type: m.type as Movement["type"], ref: s(m.ref), note: s(m.note), bal: N(m.bal) })).sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
  return {
    v: doc?.v ?? df.v,
    settings: { ...df.settings, ...doc?.settings, biz: { ...df.settings.biz, ...doc?.settings?.biz }, bank: { ...df.settings.bank, ...doc?.settings?.bank } },
    meta: { ...df.meta, ...doc?.meta },
    items, customers, invoices, ledger,
  };
}

/* ---- change tracking ---- */

export interface Snapshot { tables: Record<TableName, Map<string, string>>; settings: string }

export function snapshotOf(db: BillingData): { snap: Snapshot; rows: RowSets } {
  const rows = toRowSets(db);
  const tables = {} as Snapshot["tables"];
  for (const t of TABLES) {
    const m = new Map<string, string>();
    rows[t].forEach((row, id) => m.set(id, JSON.stringify(row)));
    tables[t] = m;
  }
  return { snap: { tables, settings: JSON.stringify(settingsDocOf(db)) }, rows };
}

/** Compares the current data with what was last saved and returns only the rows that changed. */
export function diffAgainst(saved: Snapshot, db: BillingData): { changes: Changes; next: Snapshot; count: number } {
  const { snap: next, rows } = snapshotOf(db);
  const changes: Changes = { upserts: {}, deletes: {} };
  let count = 0;
  for (const t of TABLES) {
    const up: Row[] = [], del: string[] = [];
    next.tables[t].forEach((str, id) => { if (saved.tables[t].get(id) !== str) up.push(rows[t].get(id)!); });
    saved.tables[t].forEach((_, id) => { if (!next.tables[t].has(id)) del.push(id); });
    if (up.length) changes.upserts[t] = up;
    if (del.length) changes.deletes[t] = del;
    count += up.length + del.length;
  }
  if (next.settings !== saved.settings) { changes.settings = settingsDocOf(db); count++; }
  return { changes, next, count };
}

/**
 * Splits a large change set into pieces that are safe to send one after another.
 * Deletes go first (children before parents), then upserts (parents before children), so every piece stays consistent.
 */
export function chunkChanges(c: Changes, maxRows = 1500): Changes[] {
  // A normal save is small: keep it as one piece so the database applies it in a single transaction.
  const total = TABLES.reduce((n, t) => n + (c.upserts[t]?.length ?? 0) + (c.deletes[t]?.length ?? 0), 0);
  if (total <= maxRows) return [c];
  const out: Changes[] = [];
  const piece = (): Changes => ({ upserts: {}, deletes: {} });
  for (const t of [...TABLES].reverse()) {
    const ids = c.deletes[t] ?? [];
    for (let i = 0; i < ids.length; i += maxRows) { const p = piece(); p.deletes[t] = ids.slice(i, i + maxRows); out.push(p); }
  }
  for (const t of TABLES) {
    const rows = c.upserts[t] ?? [];
    for (let i = 0; i < rows.length; i += maxRows) { const p = piece(); p.upserts[t] = rows.slice(i, i + maxRows); out.push(p); }
  }
  if (c.settings) { const p = piece(); p.settings = c.settings; out.push(p); }
  return out;
}
