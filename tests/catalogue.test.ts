import { describe, expect, it } from "vitest";
import { CATALOGUE, CATALOGUE_SIZE } from "@/lib/billing/catalogue";
import { addCatalogueItems, applyInvoiceRates, fillCatalogueBlanks, catalogueNeedsLoading, defaults, itemsDifferingFromInvoices, ensureItemCodes, migrate, nextItemCode, seed } from "@/lib/billing/data";

describe("item catalogue", () => {
  it("has 101 items with serial codes 001-101 and no duplicate names", () => {
    expect(CATALOGUE_SIZE).toBe(101);
    expect(CATALOGUE.map((c) => c.code)).toEqual(Array.from({ length: 101 }, (_, i) => String(i + 1).padStart(3, "0")));
    expect(new Set(CATALOGUE.map((c) => c.name)).size).toBe(101);
    expect(CATALOGUE.every((c) => c.name.trim() && c.english.trim() && c.category)).toBe(true);
  });
  it("loads names, HSN and GST (and the invoice unit and rate where known) but no stock or movements", () => {
    const db = defaults();
    expect(addCatalogueItems(db)).toEqual({ added: 101, linked: 0, filled: 0 });
    expect(db.items.every((i) => i.stock === 0 && i.active)).toBe(true);
    expect(db.items.every((i) => /^\d{4}$/.test(i.hsn))).toBe(true);
    expect(db.items.filter((i) => i.rate > 0)).toHaveLength(65); // only the items on your sales invoices have a rate
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
  it("every item has a 4-digit HSN and a valid GST slab", () => {
    for (const c of CATALOGUE) {
      expect([0, 5, 12, 18]).toContain(c.gst);
      expect(["", "P", "V"]).toContain(c.gstNote);
      expect(c.hsn).toMatch(/^\d{4}$/);
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
    expect(r.filled).toBe(101);
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

describe("values from your sales invoices", () => {
  const c = (code: string) => CATALOGUE.find((x) => x.code === code)!;
  it("65 items carry the unit and rate from the invoices; the other 36 do not", () => {
    expect(CATALOGUE.filter((x) => x.rate !== undefined)).toHaveLength(65);
    expect(CATALOGUE.filter((x) => x.rate === undefined)).toHaveLength(36);
  });
  it("uses the invoice HSN, GST, unit and rate", () => {
    expect(c("013")).toMatchObject({ name: "துவரம் பருப்பு", hsn: "0713", gst: 0, unit: "KGS", rate: 124 }); // loose pulses are nil
    expect(c("041")).toMatchObject({ hsn: "0910", gst: 5, unit: "KGS", rate: 611 });                       // dry ginger
    expect(c("067")).toMatchObject({ hsn: "1517", gst: 5, unit: "LTR", rate: 190 });                       // refined oil
    expect(c("069")).toMatchObject({ hsn: "0405", gst: 5, unit: "LTR", rate: 742 });                       // ghee
    expect(c("090")).toMatchObject({ hsn: "3401", gst: 18, unit: "NOS", rate: 35 });                       // washing soap
    expect(c("100")).toMatchObject({ hsn: "6505", gst: 18, unit: "PKT", rate: 8.5 });                      // head cap
    expect(c("084")).toMatchObject({ hsn: "4401", gst: 0, unit: "BDL", rate: 7.76 });                      // samidh sticks
  });
  it("item 075 is now named from the invoices", () => {
    expect(c("075")).toMatchObject({ name: "வெண்சுண்டல்", hsn: "0713", gst: 0, rate: 85 });
  });
  const oldLoaded = () => {
    const db = defaults();
    addCatalogueItems(db);
    const toor = db.items.find((i) => i.code === "013")!;
    Object.assign(toor, { gst: 5, rate: 99, unit: "NOS" });          // what an earlier version loaded
    const pen = db.items.find((i) => i.code === "097")!;
    Object.assign(pen, { gst: 18, rate: 0, unit: "NOS" });
    const old75 = db.items.find((i) => i.code === "075")!;
    Object.assign(old75, { name: "வெண்சுண்டல் (பெயரை உறுதிசெய்யவும்)", hsn: "", gst: 0, rate: 0, unit: "NOS" });
    return db;
  };
  it("finds items that differ from the invoices and updates only those", () => {
    const db = oldLoaded();
    const mine = db.items.find((i) => i.code === "054")!; // sugar: set it up to differ? no - leave as loaded, it matches
    expect(itemsDifferingFromInvoices(db).map((i) => i.code).sort()).toEqual(["013", "075", "097"]);
    expect(applyInvoiceRates(db)).toBe(3);
    expect(db.items.find((i) => i.code === "013")).toMatchObject({ gst: 0, rate: 124, unit: "KGS", hsn: "0713" });
    expect(db.items.find((i) => i.code === "097")).toMatchObject({ gst: 0, rate: 4.85, hsn: "9608" });
    expect(db.items.find((i) => i.code === "075")).toMatchObject({ name: "வெண்சுண்டல்", hsn: "0713", rate: 85 });
    expect(mine.gst).toBe(5);
    expect(itemsDifferingFromInvoices(db)).toHaveLength(0);
    expect(applyInvoiceRates(db)).toBe(0);
  });
  it("leaves the items that are not on your invoices alone", () => {
    const db = oldLoaded();
    const rice = db.items.find((i) => i.code === "001")!; // not on any invoice
    Object.assign(rice, { gst: 5, rate: 55, hsn: "1006" });
    applyInvoiceRates(db);
    expect(rice).toMatchObject({ gst: 5, rate: 55 });
  });
  it("a fresh load of an earlier name-only list fills the invoice rate and unit too", () => {
    const db = defaults();
    addCatalogueItems(db);
    for (const i of db.items) { i.hsn = ""; i.gst = 0; i.rate = 0; i.unit = "NOS"; }
    addCatalogueItems(db);
    expect(db.items.find((i) => i.code === "041")).toMatchObject({ hsn: "0910", gst: 5, rate: 611, unit: "KGS" });
  });
});

describe("filling blanks automatically", () => {
  const namesOnly = () => {
    const db = defaults();
    addCatalogueItems(db);
    for (const i of db.items) { i.hsn = ""; i.gst = 0; i.rate = 0; i.unit = "NOS"; } // as loaded by the first version
    return db;
  };
  it("fills HSN, GST, unit and rate on items loaded without them", () => {
    const db = namesOnly();
    expect(fillCatalogueBlanks(db)).toBe(101);
    expect(db.items.find((i) => i.code === "013")).toMatchObject({ hsn: "0713", gst: 0, unit: "KGS", rate: 124 });
    expect(db.items.find((i) => i.code === "054")).toMatchObject({ hsn: "1701", gst: 5, unit: "KGS", rate: 45.5 });
    expect(db.items.find((i) => i.code === "001")).toMatchObject({ hsn: "1006", gst: 0, unit: "NOS", rate: 0 }); // not on your invoices: no rate
    expect(db.items.every((i) => /^\d{4}$/.test(i.hsn))).toBe(true);
    expect(fillCatalogueBlanks(db)).toBe(0); // done: nothing left to fill
  });
  it("fills the rate on items loaded with HSN and GST but no rate", () => {
    const db = namesOnly();
    for (const i of db.items) { const c = CATALOGUE.find((x) => x.code === i.code)!; i.hsn = c.hsn; i.gst = c.gst; }
    expect(fillCatalogueBlanks(db)).toBe(65);
    expect(db.items.find((i) => i.code === "069")).toMatchObject({ unit: "LTR", rate: 742 });
  });
  it("never overwrites anything you set", () => {
    const db = namesOnly();
    const sugar = db.items.find((i) => i.code === "054")!;
    Object.assign(sugar, { hsn: "9999", gst: 12, rate: 50, unit: "KGS" });
    const toor = db.items.find((i) => i.code === "013")!;
    Object.assign(toor, { rate: 130 }); // a rate you typed (unit still NOS)
    fillCatalogueBlanks(db);
    expect(sugar).toMatchObject({ hsn: "9999", gst: 12, rate: 50, unit: "KGS" });
    expect(toor.rate).toBe(130);
  });
  it("adds no items and ignores items that are not in the catalogue", () => {
    const db = defaults();
    db.items.push({ id: "x", code: "150", name: "My own item", alt: "", hsn: "", unit: "NOS", rate: 0, gst: 0, low: 0, stock: 0, active: true });
    expect(fillCatalogueBlanks(db)).toBe(0);
    expect(db.items).toHaveLength(1);
    expect(db.items[0]).toMatchObject({ hsn: "", rate: 0 });
  });
});

