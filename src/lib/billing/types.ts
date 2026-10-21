export interface Party { name: string; address: string; mobile: string; gstin: string; pan: string }
export interface Customer extends Party { id: string; state: string }
export interface Item {
  id: string; name: string; alt: string; hsn: string; unit: string;
  code: string; rate: number; gst: number; low: number; stock: number; active: boolean;
}
/** A smaller unit for typing weights and volumes: grams for a KGS item, millilitres for a LTR item. */
export type SubUnit = "g" | "ml";
export interface Line {
  itemId: string; name: string; hsn: string; unit: string;
  qty: number | string; rate: number | string; disc: number | string; gst: number | string;
  /** Editor only: qty is typed in this smaller unit (1000 of it = 1 unit). Saved bills always hold the quantity in the item's own unit. */
  qtyUnit?: SubUnit;
}
export interface Payment { id: string; date: string; amount: number; mode: string; note: string }
export type InvoiceStatusKey = "paid" | "partial" | "unpaid" | "overdue" | "cancelled";
export interface Invoice {
  id: string; no: string; date: string; due: string;
  /** Which seller issued this bill. Empty on older bills, which belong to the first seller. */
  sellerId: string;
  custId: string; cust: Party;
  shipSame: boolean; ship: { name: string; address: string };
  pos: string; intra: boolean; roundOffOn: boolean;
  lines: Line[]; notes: string; grand: number;
  payments: Payment[]; status: "active" | "cancelled";
  createdAt: number; updatedAt?: number; cancelledAt?: number;
}
export type MoveType = "SALE" | "EDIT" | "CANCEL" | "PURCHASE" | "RETURN" | "DAMAGE" | "COUNT" | "OPENING";
export interface Movement {
  id: string; ts: number; date: string; itemId: string; name: string;
  qty: number; type: MoveType; ref: string; note: string; bal: number;
}
export interface BusinessDetails { name: string; address: string; mobile: string; gstin: string; pan: string; state: string }
export interface BankDetails { holder: string; ifsc: string; acc: string; bank: string; customerId: string }
/** One firm that issues bills (the "bill from" party): its letterhead, tax ids, bank details and own invoice numbering. */
export interface Seller { id: string; biz: BusinessDetails; bank: BankDetails; prefix: string; nextNo: number }
export interface Settings {
  sellers: Seller[];
  /** The firm bills are issued from by default (the switch in the sidebar). */
  sellerId: string;
  dueDays: number; notes: string; terms: string;
  signLabel: string; allowNegative: boolean; roundOff: boolean;
  /** Off by default: bills do not touch stock and the stock screens are hidden. */
  trackStock: boolean;
}
export interface BillingData {
  v: number; settings: Settings;
  items: Item[]; customers: Customer[]; invoices: Invoice[]; ledger: Movement[];
  meta: { lastBackup: number | null; sampleNote: boolean; savedAt?: number };
}
