import { invPaid, invStatus, round2, todayISO, totalsOf } from "./calc";
import type { BillingData } from "./types";

export function download(name: string, text: string, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

export function csv(rows: (string | number)[][]) {
  return "﻿" + rows.map((r) => r.map((v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(",")).join("\r\n");
}

export function invoicesCsv(db: BillingData) {
  const rows: (string | number)[][] = [["Invoice no", "Date", "Customer", "GSTIN", "Place of supply", "Taxable", "CGST", "SGST", "IGST", "Round off", "Total", "Received", "Balance", "Status"]];
  [...db.invoices].sort((a, b) => a.date.localeCompare(b.date)).forEach((i) => {
    const c = totalsOf(i), p = invPaid(i);
    const cg = c.groups.reduce((s, g) => s + g.cgst, 0), sg = c.groups.reduce((s, g) => s + g.sgst, 0);
    rows.push([i.no, i.date, i.cust.name, i.cust.gstin, i.pos, c.taxable, c.intra ? round2(cg) : 0, c.intra ? round2(sg) : 0, c.intra ? 0 : c.tax, c.roundOff, c.grand, p, i.status === "cancelled" ? 0 : round2(c.grand - p), invStatus(i, todayISO())]);
  });
  return csv(rows);
}

export function stockCsv(db: BillingData) {
  const rows: (string | number)[][] = [["Code", "Item", "HSN", "Unit", "Rate", "GST %", "In stock", "Alert at"]];
  db.items.forEach((i) => rows.push([i.code, i.name, i.hsn, i.unit, i.rate, i.gst, i.stock, i.low]));
  return csv(rows);
}
