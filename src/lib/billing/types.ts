export interface Party { name: string; address: string; mobile: string; gstin: string; pan: string }
export interface Customer extends Party { id: string; state: string }
export interface Item {
  id: string; name: string; alt: string; hsn: string; unit: string;
  rate: number; gst: number; low: number; stock: number; active: boolean;
}
export interface Line {
  itemId: string; name: string; hsn: string; unit: string;
  qty: number | string; rate: number | string; disc: number | string; gst: number | string;
}
export interface Payment { id: string; date: string; amount: number; mode: string; note: string }
export type InvoiceStatusKey = "paid" | "partial" | "unpaid" | "overdue" | "cancelled";
export interface Invoice {
  id: string; no: string; date: string; due: string;
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
export interface Settings {
  biz: { name: string; address: string; mobile: string; gstin: string; pan: string; state: string };
  bank: { holder: string; ifsc: string; acc: string; bank: string };
  prefix: string; nextNo: number; dueDays: number; notes: string; terms: string;
  signLabel: string; allowNegative: boolean; roundOff: boolean;
}
export interface BillingData {
  v: number; settings: Settings;
  items: Item[]; customers: Customer[]; invoices: Invoice[]; ledger: Movement[];
  meta: { lastBackup: number | null; sampleNote: boolean; savedAt?: number };
}
