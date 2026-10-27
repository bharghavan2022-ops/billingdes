import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Paper } from "@/components/paper";
import { baseQty, calcInvoice, calcLine, fmtQty, qtyByItem, subUnitOf } from "@/lib/billing/calc";
import { seed } from "@/lib/billing/data";
import type { Line } from "@/lib/billing/types";

const line = (p: Partial<Line>): Line => ({ itemId: "i", name: "Toor dal", hsn: "0713", unit: "KGS", qty: 1, rate: 124, disc: 0, gst: 0, ...p });

describe("weights and volumes priced in proportion", () => {
  it("knows which units can be typed in a smaller unit", () => {
    expect(subUnitOf("KGS")).toBe("g");
    expect(subUnitOf("kg")).toBe("g");
    expect(subUnitOf("LTR")).toBe("ml");
    expect(subUnitOf("NOS")).toBeNull();
    expect(subUnitOf("PKT")).toBeNull();
  });
  it("1 kg is the standard: the rate is per kg", () => {
    expect(calcLine(line({ qty: 1 })).amount).toBe(124);
  });
  it("below 1 kg the amount is divided, above 1 kg it is multiplied", () => {
    expect(calcLine(line({ qty: 250, qtyUnit: "g" })).amount).toBe(31);    // 0.25 kg
    expect(calcLine(line({ qty: 500, qtyUnit: "g" })).amount).toBe(62);    // half a kg
    expect(calcLine(line({ qty: 2.5 })).amount).toBe(310);                  // 2.5 kg
    expect(calcLine(line({ qty: 1500, qtyUnit: "g" })).amount).toBe(186);  // 1.5 kg typed in grams
    expect(calcLine(line({ qty: 100, qtyUnit: "g" })).amount).toBe(12.4);
  });
  it("typing the same weight in kg or in grams gives the same amount", () => {
    for (const grams of [1, 50, 125, 250, 333, 750, 999, 1000, 2500]) {
      expect(calcLine(line({ qty: grams, qtyUnit: "g" })).amount).toBe(calcLine(line({ qty: grams / 1000 })).amount);
    }
  });
  it("works for litres and millilitres", () => {
    const oil = line({ unit: "LTR", rate: 190 });
    expect(calcLine({ ...oil, qty: 500, qtyUnit: "ml" }).amount).toBe(95);
    expect(calcLine({ ...oil, qty: 2.5 }).amount).toBe(475);
  });
  it("applies discount and GST on the proportional amount", () => {
    const c = calcLine(line({ qty: 250, qtyUnit: "g", rate: 261, gst: 5, disc: 10 }));
    expect(c).toEqual({ gross: 65.25, discAmt: 6.53, taxable: 58.72, tax: 2.94, amount: 61.66 });
  });
  it("adds up a bill with several weights and the CGST/SGST split", () => {
    const inv = calcInvoice([line({ qty: 250, qtyUnit: "g", rate: 261, gst: 5 }), line({ qty: 2, rate: 100, gst: 5 }), line({ qty: 500, qtyUnit: "g", rate: 124 })], true, false);
    expect(inv.qty).toBe(2.75);                 // 0.25 + 2 + 0.5 kg
    expect(inv.taxable).toBe(327.25);
    expect(inv.groups[0]).toMatchObject({ rate: 5, taxable: 265.25, tax: 13.26 });
  });
  it("counts stock in the item's own unit whichever unit was typed", () => {
    expect(qtyByItem([line({ qty: 250, qtyUnit: "g" }), line({ qty: 1.5 })])).toEqual({ i: 1.75 });
    expect(baseQty({ qty: "", qtyUnit: "g" })).toBe(0);
  });
});

describe("how a quantity prints", () => {
  it("shows grams under 1 kg and the item's unit otherwise", () => {
    expect(fmtQty(0.25, "KGS")).toBe("250 GMS");
    expect(fmtQty(0.5, "KGS")).toBe("500 GMS");
    expect(fmtQty(1, "KGS")).toBe("1 KGS");
    expect(fmtQty(2.5, "KGS")).toBe("2.5 KGS");
    expect(fmtQty(0.5, "LTR")).toBe("500 ML");
    expect(fmtQty(0.25, "NOS")).toBe("0.25 NOS");
  });
  it("the printed bill shows the quantity and states that the rate is per kg", () => {
    const db = seed();
    const inv = db.invoices[0];
    inv.lines = [line({ qty: 0.25, rate: 124 }), line({ name: "Sugar", qty: 2.5, rate: 45.5 }), line({ name: "Pen", unit: "NOS", qty: 6, rate: 5 })];
    const html = renderToStaticMarkup(<Paper inv={inv} settings={db.settings} label="" />);
    expect(html).toContain("250 GMS");
    expect(html).toContain("2.5 KGS");
    expect(html).toContain("6 NOS");
    expect(html).toContain("/KGS");
    expect(html.match(/\/KGS/g)).toHaveLength(2); // only the two weight lines
  });
  it("shows a quantity subtotal only when every line uses the same unit", () => {
    const db = seed();
    const inv = db.invoices[0];
    const subtotal = (lines: Line[]) => { inv.lines = lines; const h = renderToStaticMarkup(<Paper inv={inv} settings={db.settings} label="" />); return /SUBTOTAL<\/div><div class="c"><\/div><div class="c n">([^<]*)</.exec(h)?.[1]; };
    expect(subtotal([line({ qty: 0.25 }), line({ qty: 2 })])).toBe("2.25");
    expect(subtotal([line({ qty: 0.25 }), line({ unit: "LTR", qty: 0.5 })])).toBe("");
  });
});

describe("page splitting", () => {
  it("never puts more rows on a page than fit, and never loses a row", async () => {
    const { paginate } = await import("@/components/paper");
    const avail = { full: 730, last: 457 };
    for (const n of [1, 5, 12, 13, 20, 21, 25, 37, 60]) {
      const rows = Array.from({ length: n }, () => 36.08);
      const pages = paginate(rows, avail);
      expect(pages.flat()).toEqual(rows.map((_, i) => i));
      pages.forEach((p, k) => {
        const h = p.reduce((a, i) => a + rows[i], 0);
        expect(h).toBeLessThanOrEqual(k === pages.length - 1 ? avail.last : avail.full);
        expect(p.length).toBeGreaterThan(0);
      });
    }
  });
  it("copes with tall rows", async () => {
    const { paginate } = await import("@/components/paper");
    const pages = paginate([60, 36, 90, 36, 60, 36, 36, 120, 36], { full: 200, last: 120 });
    expect(pages.flat().length).toBe(9);
    expect(pages.length).toBeGreaterThan(2);
  });
});
