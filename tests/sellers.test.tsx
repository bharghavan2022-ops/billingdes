import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GSTIN_RE } from "@/lib/billing/calc";
import { Paper } from "@/components/paper";
import { SRI_ID, VELAN_ID, bumpNext, defaults, isIntra, migrate, nextNoStr, normalizeSettings, sellerOf, sellerOfInvoice, seed } from "@/lib/billing/data";
import { diffAgainst, fromRows, settingsDocOf, snapshotOf, toRowSets, type LoadedRows } from "@/lib/billing/rows";

describe("the two firms", () => {
  it("VELAN & CO has exactly the details given", () => {
    const v = sellerOf(defaults().settings, VELAN_ID);
    expect(v.biz).toMatchObject({ name: "VELAN & CO", gstin: "33EKOPS1500P1ZR", pan: "EKOPS1500P", state: "Tamil Nadu" });
    expect(v.biz.address).toBe("Flat No.17A, Hot Water Channel Road, Ponnagaram, Madurai - 625016.");
    expect(v.bank).toMatchObject({ acc: "249702000003412", customerId: "152402872", ifsc: "FDRL0002497", holder: "VELAN & CO" });
    expect(v.biz.gstin).toMatch(GSTIN_RE);
    expect(v.biz.gstin.slice(2, 12)).toBe(v.biz.pan); // the PAN is embedded in the GSTIN
  });
  it("starts with Sri Angalaeshwari Traders selected", () => {
    const s = defaults().settings;
    expect(s.sellers.map((x) => x.id)).toEqual([SRI_ID, VELAN_ID]);
    expect(s.sellerId).toBe(SRI_ID);
  });
});

describe("upgrading data saved with one business", () => {
  const legacy = {
    biz: { name: "My Shop", address: "Old road", mobile: "99", gstin: "33QBSPS1659N1ZE", pan: "QBSPS1659N", state: "Tamil Nadu" },
    bank: { holder: "MY SHOP", ifsc: "SBIN0000869", acc: "123", bank: "SBI" },
    prefix: "S-", nextNo: 77, dueDays: 10, notes: "n", terms: "t", signLabel: "Sign", allowNegative: false, roundOff: true, trackStock: false,
  };
  it("keeps the old business as the first firm, with its numbering, and adds VELAN & CO", () => {
    const s = normalizeSettings(legacy);
    expect(s.sellers).toHaveLength(2);
    expect(s.sellers[0]).toMatchObject({ id: SRI_ID, prefix: "S-", nextNo: 77, biz: { name: "My Shop", gstin: "33QBSPS1659N1ZE" }, bank: { acc: "123", customerId: "" } });
    expect(s.sellers[1].biz.name).toBe("VELAN & CO");
    expect(s.sellerId).toBe(SRI_ID);
    expect(s).toMatchObject({ dueDays: 10, roundOff: true, notes: "n" });
    expect("biz" in s || "bank" in s || "prefix" in s || "nextNo" in s).toBe(false);
  });
  it("is stable: normalising twice changes nothing, and saved edits are kept", () => {
    const once = normalizeSettings(legacy);
    expect(normalizeSettings(once)).toEqual(once);
    once.sellers[1].biz.mobile = "12345";
    expect(normalizeSettings(once).sellers[1].biz.mobile).toBe("12345");
  });
  it("older bills (no seller) belong to the first firm", () => {
    const db = migrate({ settings: legacy as never, invoices: [{ id: "a", no: "1" } as never] });
    expect(db.invoices[0].sellerId).toBe("");
    expect(sellerOfInvoice(db.settings, db.invoices[0]).id).toBe(SRI_ID);
  });
  it("falls back safely for an unknown seller id", () => {
    const s = defaults().settings;
    expect(sellerOf(s, "nope").id).toBe(SRI_ID);
    s.sellerId = VELAN_ID;
    expect(sellerOf(s, "nope").id).toBe(VELAN_ID); // the selected firm
    expect(normalizeSettings({ ...s, sellerId: "gone" }).sellerId).toBe(SRI_ID);
  });
});

describe("numbering and tax per firm", () => {
  it("each firm counts its own bills", () => {
    const db = defaults();
    db.settings.sellers[0].nextNo = 50;
    expect(nextNoStr(db, SRI_ID)).toBe("50");
    expect(nextNoStr(db, VELAN_ID)).toBe("VC-1");
    bumpNext(db, "VC-1", VELAN_ID);
    expect(nextNoStr(db, VELAN_ID)).toBe("VC-2");
    expect(nextNoStr(db, SRI_ID)).toBe("50"); // untouched
    bumpNext(db, "50", SRI_ID);
    expect(nextNoStr(db, SRI_ID)).toBe("51");
  });
  it("CGST+SGST versus IGST follows the firm's own state", () => {
    const db = defaults();
    db.settings.sellers[1].biz.state = "Kerala";
    expect(isIntra(db, "Tamil Nadu", SRI_ID)).toBe(true);
    expect(isIntra(db, "Tamil Nadu", VELAN_ID)).toBe(false);
    expect(isIntra(db, "Kerala", VELAN_ID)).toBe(true);
  });
});

describe("saving and loading", () => {
  const loaded = (db: ReturnType<typeof seed>): LoadedRows => {
    const r = toRowSets(db);
    return { settings: settingsDocOf(db), items: [...r.items.values()], customers: [...r.customers.values()], invoices: [...r.invoices.values()], invoice_lines: [...r.invoice_lines.values()], payments: [...r.payments.values()], stock_movements: [...r.stock_movements.values()] };
  };
  it("remembers which firm issued a bill, and both firms' details, through the database rows", () => {
    const db = seed();
    db.invoices[0].sellerId = VELAN_ID;
    db.settings.sellerId = VELAN_ID;
    const back = fromRows(loaded(db));
    expect(back.invoices[0].sellerId).toBe(VELAN_ID);
    expect(back.settings.sellerId).toBe(VELAN_ID);
    expect(back.settings.sellers[1].bank.customerId).toBe("152402872");
    expect(toRowSets(db).invoices.get(db.invoices[0].id)!.seller_id).toBe(VELAN_ID);
  });
  it("saves a firm's edited details and the switch as a settings change only", () => {
    const db = seed();
    const { snap } = snapshotOf(db);
    const next = structuredClone(db);
    next.settings.sellerId = VELAN_ID;
    const { changes } = diffAgainst(snap, next);
    expect(changes.settings?.settings.sellerId).toBe(VELAN_ID);
    expect(changes.upserts).toEqual({});
  });
});

describe("the printed bill", () => {
  const print = (sellerId: string) => {
    const db = seed();
    db.invoices[0].sellerId = sellerId;
    return renderToStaticMarkup(<Paper inv={db.invoices[0]} settings={db.settings} label="ORIGINAL FOR RECIPIENT" />);
  };
  it("shows VELAN & CO's letterhead, tax ids and bank details when issued by VELAN & CO", () => {
    const html = print(VELAN_ID);
    for (const t of ["VELAN &amp; CO", "Flat No.17A, Hot Water Channel Road, Ponnagaram, Madurai - 625016.", "GSTIN : 33EKOPS1500P1ZR", "PAN Number : EKOPS1500P",
      "Account No: 249702000003412", "Customer ID: 152402872", "IFSC Code: FDRL0002497", "Authorised Signature for VELAN &amp; CO"]) expect(html).toContain(t);
    expect(html).not.toContain("Angalaeshwari");
    expect(html).not.toContain("33QBSPS1659N1ZE");
    expect(html).not.toContain("44511788356");
  });
  it("shows Sri Angalaeshwari Traders' details when issued by them", () => {
    const html = print(SRI_ID);
    for (const t of ["Sri Angalaeshwari Traders", "GSTIN : 33QBSPS1659N1ZE", "Account No: 44511788356", "IFSC Code: SBIN0000869"]) expect(html).toContain(t);
    expect(html).not.toContain("VELAN");
    expect(html).not.toContain("Customer ID");
  });
  it("an old bill without a firm prints as the first firm", () => {
    expect(print("")).toContain("GSTIN : 33QBSPS1659N1ZE");
  });
});

describe("bill heading", () => {
  it("prints centred at the top and survives a save and load", () => {
    const db = seed();
    const inv = db.invoices[0];
    inv.heading = "BILL OF SUPPLY";
    const html = renderToStaticMarkup(<Paper inv={inv} settings={db.settings} label="" />);
    expect(html).toContain('<h2 class="p-title">BILL OF SUPPLY</h2>');
    expect(html).not.toContain("TAX INVOICE");
    inv.heading = "";
    expect(renderToStaticMarkup(<Paper inv={inv} settings={db.settings} label="" />)).not.toContain("p-title");
    const rows = toRowSets(db).invoices.get(inv.id) as { heading: string | null };
    expect(rows.heading).toBe("");
  });
});
