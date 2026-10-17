import { describe, expect, it } from "vitest";
import { CATALOGUE, CATALOGUE_SIZE } from "@/lib/billing/catalogue";
import { addCatalogueItems, catalogueNeedsLoading, defaults, ensureItemCodes, migrate, nextItemCode, seed } from "@/lib/billing/data";

describe("item catalogue", () => {
  it("has 101 items with serial codes 001-101 and no duplicate names", () => {
    expect(CATALOGUE_SIZE).toBe(101);
    expect(CATALOGUE.map((c) => c.code)).toEqual(Array.from({ length: 101 }, (_, i) => String(i + 1).padStart(3, "0")));
    expect(new Set(CATALOGUE.map((c) => c.name)).size).toBe(101);
    expect(CATALOGUE.every((c) => c.name.trim() && c.english.trim() && c.category)).toBe(true);
  });
  it("loads names with HSN and GST but no stock, rate or movements", () => {
    const db = defaults();
    expect(addCatalogueItems(db)).toEqual({ added: 101, linked: 0, filled: 0 });
    expect(db.items.every((i) => i.stock === 0 && i.rate === 0 && i.active)).toBe(true);
    expect(db.items.filter((i) => i.code !== "075").every((i) => /^\d{4}$/.test(i.hsn))).toBe(true);
    expect(db.ledger).toHaveLength(0);
    expect(db.items[0]).toMatchObject({ code: "001", name: "பொன்னி பச்சரிசி", alt: "Ponni raw rice" });
  });
  it("is safe to run twice and skips items you already have", () => {
    const db = defaults();
    db.items.push({ id: "x", code: "", name: "ரவை", alt: "", hsn: "", unit: "KGS", rate: 5, gst: 0, low: 0, stock: 9, active: true });
    expect(addCatalogueItems(db)).toEqual({ added: 100, linked: 1, filled: 0 }); // "ரவை" is already there by name
    expect(addCatalogueItems(db)).toEqual({ added: 0, linked: 0, filled: 0 });
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
    expect(addCatalogueItems(db)).toEqual({ added: 99, linked: 2, filled: 0 });
    expect(db.items).toHaveLength(102);
    expect(db.items.find((i) => i.name === "ஊறுகாய்")!.code).toBe("070");
    expect(db.items.find((i) => i.name === "ரீஃபில் பேனா")!.code).toBe("097");
    expect(new Set(db.items.map((i) => i.code)).size).toBe(102);
  });
  it("sample data items get codes too", () => {
    expect(seed().items.map((i) => i.code)).toEqual(["102", "103", "104"]);
  });
});

describe("HSN and GST", () => {
  const rate = (code: string) => CATALOGUE.find((c) => c.code === code)!;
  it("every item has a 4-digit HSN (except the unreadable 075) and a valid GST slab", () => {
    for (const c of CATALOGUE) {
      expect([0, 5, 12, 18]).toContain(c.gst);
      expect(["", "P", "V"]).toContain(c.gstNote);
      if (c.code !== "075") expect(c.hsn).toMatch(/^\d{4}$/);
    }
  });
  it("spot checks of well-known rates", () => {
    expect(rate("054")).toMatchObject({ name: "சீனி", hsn: "1701", gst: 5 }); // sugar
    expect(rate("062")).toMatchObject({ hsn: "2501", gst: 0 });             // salt
    expect(rate("065")).toMatchObject({ hsn: "1515", gst: 5 });             // sesame oil
    expect(rate("069")).toMatchObject({ hsn: "0405", gst: 5 });             // ghee
    expect(rate("071")).toMatchObject({ hsn: "1905", gst: 0 });             // appalam
    expect(rate("058")).toMatchObject({ hsn: "1701", gst: 0 });             // jaggery
    expect(rate("096")).toMatchObject({ hsn: "9619", gst: 0 });             // sanitary pads
  });
  it("fills HSN and GST on catalogue items that were loaded earlier without them", () => {
    const db = defaults();
    addCatalogueItems(db);
    for (const i of db.items) { i.hsn = ""; i.gst = 0; }
    expect(catalogueNeedsLoading(db)).toBe(true);
    const r = addCatalogueItems(db);
    expect(r.added).toBe(0);
    expect(r.filled).toBe(100); // 075 has no HSN to fill
    expect(db.items.find((i) => i.code === "054")).toMatchObject({ hsn: "1701", gst: 5 });
    expect(catalogueNeedsLoading(db)).toBe(false);
  });
  it("never overwrites an HSN or GST you set yourself", () => {
    const db = defaults();
    addCatalogueItems(db);
    const sugar = db.items.find((i) => i.code === "054")!;
    sugar.hsn = "9999"; sugar.gst = 12;
    addCatalogueItems(db);
    expect(sugar).toMatchObject({ hsn: "9999", gst: 12 });
  });
});

describe("stock tracking", () => {
  it("is off by default, also for older saved data", () => {
    expect(defaults().settings.trackStock).toBe(false);
    expect(migrate({ settings: { signLabel: "x" } as never }).settings.trackStock).toBe(false);
  });
});
