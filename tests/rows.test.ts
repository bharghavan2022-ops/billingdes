import { describe, expect, it } from "vitest";
import { applyStock, defaults, invById, seed } from "@/lib/billing/data";
import { TABLES, chunkChanges, diffAgainst, fromRows, settingsDocOf, snapshotOf, toRowSets, type LoadedRows } from "@/lib/billing/rows";
import type { BillingData } from "@/lib/billing/types";

const asLoaded = (db: BillingData): LoadedRows => {
  const r = toRowSets(db);
  const arr = (t: (typeof TABLES)[number]) => [...r[t].values()].reverse(); // database order is not insertion order
  return { settings: settingsDocOf(db), items: arr("items"), customers: arr("customers"), invoices: arr("invoices"), invoice_lines: arr("invoice_lines"), payments: arr("payments"), stock_movements: arr("stock_movements") };
};

describe("row mapping", () => {
  it("round-trips the whole account through database rows", () => {
    const db = seed();
    db.invoices[0].payments.push({ id: "p1", date: "2026-09-02", amount: 50, mode: "UPI", note: "advance" });
    db.invoices[0].updatedAt = 123;
    const back = fromRows(asLoaded(db));
    const byId = <T extends { id: string }>(a: T[]) => [...a].sort((x, y) => x.id.localeCompare(y.id));
    expect(byId(back.items)).toEqual(byId(db.items)); // the app sorts items and customers itself when it shows them
    expect(byId(back.customers)).toEqual(byId(db.customers));
    expect(back.invoices).toEqual(db.invoices);
    expect(back.ledger).toEqual(db.ledger);
    expect(back.settings).toEqual(db.settings);
    expect(back.meta.sampleNote).toBe(true);
  });
  it("keeps line order and treats empty dates as null", () => {
    const db = seed();
    db.invoices[0].due = "";
    const row = toRowSets(db).invoices.get(db.invoices[0].id)!;
    expect(row.due).toBeNull();
    expect(fromRows(asLoaded(db)).invoices[0].due).toBe("");
    expect(fromRows(asLoaded(db)).invoices[0].lines.map((l) => l.name)).toEqual(db.invoices[0].lines.map((l) => l.name));
  });
});

describe("change tracking", () => {
  it("finds nothing to save when nothing changed", () => {
    const db = seed();
    expect(diffAgainst(snapshotOf(db).snap, db).count).toBe(0);
  });
  it("saves only the rows a new bill touches", () => {
    const db = seed();
    const { snap } = snapshotOf(db);
    const next = structuredClone(db);
    const inv = structuredClone(next.invoices[0]);
    inv.id = "new1"; inv.no = "50"; inv.createdAt += 1;
    next.invoices.push(inv);
    applyStock(next, inv, null);
    next.settings.sellers[0].nextNo = 51;
    const { changes } = diffAgainst(snap, next);
    expect(changes.upserts.invoices).toHaveLength(1);
    expect(changes.upserts.invoice_lines).toHaveLength(3);
    expect(changes.upserts.stock_movements).toHaveLength(3);
    expect(changes.upserts.items).toHaveLength(3); // stock of the three billed items changed
    expect(changes.upserts.customers).toBeUndefined();
    expect(changes.settings?.settings.sellers[0].nextNo).toBe(51);
    expect(changes.deletes).toEqual({});
  });
  it("deletes removed lines and payments", () => {
    const db = seed();
    db.invoices[0].payments.push({ id: "p1", date: "2026-09-02", amount: 50, mode: "UPI", note: "" });
    const { snap } = snapshotOf(db);
    const next = structuredClone(db);
    invById(next, next.invoices[0].id)!.lines.pop();
    invById(next, next.invoices[0].id)!.payments = [];
    const { changes } = diffAgainst(snap, next);
    expect(changes.deletes.invoice_lines).toEqual([`${db.invoices[0].id}:2`]);
    expect(changes.deletes.payments).toEqual(["p1"]);
  });
  it("sees a restore as deletes plus upserts", () => {
    const { snap } = snapshotOf(seed());
    const { changes, count } = diffAgainst(snap, defaults());
    expect(changes.deletes.items).toHaveLength(3);
    expect(count).toBeGreaterThan(10);
  });
});

describe("chunking", () => {
  it("keeps a normal save in one piece (one transaction)", () => {
    const db = seed();
    const { changes } = diffAgainst(snapshotOf(defaults()).snap, db);
    expect(chunkChanges(changes)).toHaveLength(1);
  });
  it("splits big saves: deletes children-first, then upserts parents-first, settings last", () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: "m" + i }));
    const parts = chunkChanges({ settings: settingsDocOf(defaults()), upserts: { invoices: rows.slice(0, 10), stock_movements: rows }, deletes: { items: ["a"], invoice_lines: ["x:0"] } }, 1000);
    const kinds = parts.map((p) => Object.keys(p.deletes).concat(Object.keys(p.upserts)).concat(p.settings ? ["settings"] : []).join());
    expect(kinds).toEqual(["invoice_lines", "items", "invoices", "stock_movements", "stock_movements", "stock_movements", "settings"]);
    expect(parts.every((p) => Object.values(p.upserts).every((r) => r!.length <= 1000))).toBe(true);
  });
});
