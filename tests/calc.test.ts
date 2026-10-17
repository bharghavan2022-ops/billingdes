import { describe, expect, it } from "vitest";
import { calcInvoice, calcLine, inWords, invStatus, qtyByItem } from "@/lib/billing/calc";
import { applyStock, defaults, seed, stockProblems } from "@/lib/billing/data";
import type { Invoice } from "@/lib/billing/types";

describe("calcLine / calcInvoice", () => {
  it("applies discount then GST", () => {
    expect(calcLine({ qty: 2, rate: 100, disc: 10, gst: 18 })).toEqual({ gross: 200, discAmt: 20, taxable: 180, tax: 32.4, amount: 212.4 });
  });
  it("splits tax into CGST/SGST and rounds off", () => {
    const c = calcInvoice([{ itemId: "a", name: "x", hsn: "", unit: "", qty: 1, rate: 100.4, disc: 0, gst: 5 }], true, true);
    expect(c.groups[0]).toMatchObject({ rate: 5, taxable: 100.4, tax: 5.02 });
    expect(c.grand).toBe(105);
    expect(c.roundOff).toBe(-0.42);
  });
});

describe("inWords", () => {
  it("uses the Indian numbering system", () => {
    expect(inWords(123456.5)).toBe("One Lakh Twenty Three Thousand Four Hundred Fifty Six Rupees and Fifty Paise");
    expect(inWords(0)).toBe("Zero Rupees");
  });
});

describe("invStatus", () => {
  const base = { grand: 100, due: "2026-01-10", payments: [], status: "active" } as unknown as Invoice;
  it("tracks unpaid, partial, overdue, paid, cancelled", () => {
    expect(invStatus(base, "2026-01-05")).toBe("unpaid");
    expect(invStatus(base, "2026-01-11")).toBe("overdue");
    expect(invStatus({ ...base, payments: [{ id: "p", date: "", amount: 40, mode: "Cash", note: "" }] }, "2026-01-05")).toBe("partial");
    expect(invStatus({ ...base, payments: [{ id: "p", date: "", amount: 100, mode: "Cash", note: "" }] }, "2026-02-01")).toBe("paid");
    expect(invStatus({ ...base, status: "cancelled" }, "2026-01-05")).toBe("cancelled");
  });
});

describe("stock", () => {
  it("seed data bills reduce stock and the sample invoice is consistent", () => {
    const db = seed();
    expect(db.invoices).toHaveLength(1);
    const pickle = db.items.find((i) => i.alt === "Pickle")!;
    expect(pickle.stock).toBeCloseTo(50 - 0.162, 3);
    expect(db.ledger.filter((m) => m.type === "SALE")).toHaveLength(3);
  });
  it("flags over-selling and applies edits as deltas", () => {
    const db = defaults();
    db.items.push({ id: "i1", code: "001", name: "Rice", alt: "", hsn: "", unit: "KGS", rate: 10, gst: 0, low: 0, stock: 5, active: true });
    const lines = [{ itemId: "i1", name: "Rice", hsn: "", unit: "KGS", qty: 8, rate: 10, disc: 0, gst: 0 }];
    expect(stockProblems(db, lines)).toHaveLength(1);
    const inv = { no: "1", date: "2026-01-01", cust: { name: "A" }, lines: [{ ...lines[0], qty: 3 }] } as unknown as Invoice;
    applyStock(db, inv, null);
    expect(db.items[0].stock).toBe(2);
    applyStock(db, { ...inv, lines: [{ ...lines[0], qty: 4 }] } as Invoice, inv);
    expect(db.items[0].stock).toBe(1);
    expect(qtyByItem(inv.lines)).toEqual({ i1: 3 });
  });
});
