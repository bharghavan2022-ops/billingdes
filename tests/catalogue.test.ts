import { describe, expect, it } from "vitest";
import { CATALOGUE, CATALOGUE_SIZE } from "@/lib/billing/catalogue";
import { addCatalogueItems, defaults, ensureItemCodes, migrate, nextItemCode, seed } from "@/lib/billing/data";

describe("item catalogue", () => {
  it("has 101 items with serial codes 001-101 and no duplicate names", () => {
    expect(CATALOGUE_SIZE).toBe(101);
    expect(CATALOGUE.map((c) => c.code)).toEqual(Array.from({ length: 101 }, (_, i) => String(i + 1).padStart(3, "0")));
    expect(new Set(CATALOGUE.map((c) => c.name)).size).toBe(101);
    expect(CATALOGUE.every((c) => c.name.trim() && c.english.trim() && c.category)).toBe(true);
  });
  it("loads names only: no stock, rate or movements", () => {
    const db = defaults();
    expect(addCatalogueItems(db)).toEqual({ added: 101, linked: 0 });
    expect(db.items.every((i) => i.stock === 0 && i.rate === 0 && i.gst === 0 && i.active)).toBe(true);
    expect(db.ledger).toHaveLength(0);
    expect(db.items[0]).toMatchObject({ code: "001", name: "பொன்னி பச்சரிசி", alt: "Ponni raw rice" });
  });
  it("is safe to run twice and skips items you already have", () => {
    const db = defaults();
    db.items.push({ id: "x", code: "", name: "ரவை", alt: "", hsn: "", unit: "KGS", rate: 5, gst: 0, low: 0, stock: 9, active: true });
    expect(addCatalogueItems(db)).toEqual({ added: 100, linked: 1 }); // "ரவை" is already there by name
    expect(addCatalogueItems(db)).toEqual({ added: 0, linked: 0 });
    const mine = db.items.find((i) => i.name === "ரவை")!;
    expect(mine).toMatchObject({ code: "007", stock: 9, rate: 5, unit: "KGS" }); // keeps its stock and details, takes the catalogue code
    expect(db.items).toHaveLength(101);
  });
});

describe("item codes", () => {
  it("numbers new items from 102 and continues from the highest code", () => {
    const db = defaults();
    expect(nextItemCode(db)).toBe("102");
    addCatalogueItems(db);
    expect(nextItemCode(db)).toBe("102");
    db.items.push({ id: "n", code: "102", name: "New", alt: "", hsn: "", unit: "NOS", rate: 0, gst: 0, low: 0, stock: 0, active: true });
    expect(nextItemCode(db)).toBe("103");
    db.items.push({ id: "m", code: "250", name: "Big", alt: "", hsn: "", unit: "NOS", rate: 0, gst: 0, low: 0, stock: 0, active: true });
    expect(nextItemCode(db)).toBe("251");
  });
  it("gives older items without a code unique codes, and keeps existing codes", () => {
    const db = defaults();
    const mk = (id: string, code: string) => ({ id, code, name: id, alt: "", hsn: "", unit: "NOS", rate: 0, gst: 0, low: 0, stock: 0, active: true });
    db.items.push(mk("a", ""), mk("b", "105"), mk("c", ""));
    ensureItemCodes(db);
    expect(db.items.map((i) => i.code)).toEqual(["106", "105", "107"]);
    expect(new Set(db.items.map((i) => i.code)).size).toBe(3);
    const loaded = migrate({ items: [{ ...mk("z", "") }] });
    expect(loaded.items[0].code).toBe("102");
  });
  it("an existing item with a catalogue name takes that code instead of leaving a gap", () => {
    const db = seed(); // sample items include "ஊறுகாய்" and "ரீஃபில் பேனா"
    expect(addCatalogueItems(db)).toEqual({ added: 99, linked: 2 });
    expect(db.items).toHaveLength(102);
    expect(db.items.find((i) => i.name === "ஊறுகாய்")!.code).toBe("070");
    expect(db.items.find((i) => i.name === "ரீஃபில் பேனா")!.code).toBe("097");
    expect(new Set(db.items.map((i) => i.code)).size).toBe(102);
  });
  it("sample data items get codes too", () => {
    expect(seed().items.map((i) => i.code)).toEqual(["102", "103", "104"]);
  });
});
