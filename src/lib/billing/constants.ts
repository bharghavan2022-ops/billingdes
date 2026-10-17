import type { InvoiceStatusKey, MoveType } from "./types";

export const STATES = ["Andaman and Nicobar Islands","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chandigarh","Chhattisgarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Goa","Gujarat","Haryana","Himachal Pradesh","Jammu and Kashmir","Jharkhand","Karnataka","Kerala","Ladakh","Lakshadweep","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Puducherry","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal"];
export const COPIES = { orig: "ORIGINAL FOR RECIPIENT", dup: "DUPLICATE FOR TRANSPORTER", trip: "TRIPLICATE FOR SUPPLIER", none: "" } as const;
export type CopyKey = keyof typeof COPIES | "all";
export const STATUS_LABEL: Record<InvoiceStatusKey, string> = { paid: "Paid", partial: "Part paid", unpaid: "Unpaid", overdue: "Overdue", cancelled: "Cancelled" };
export const MOVE_LABEL: Record<MoveType, string> = { SALE: "Sold", EDIT: "Bill edited", CANCEL: "Bill cancelled", PURCHASE: "Stock in", RETURN: "Customer return", DAMAGE: "Damaged or lost", COUNT: "Count correction", OPENING: "Opening stock" };
export const PAY_MODES = ["Cash", "UPI", "Bank transfer", "Cheque"];
export const FULLROWS = 24;
export const LASTROWS = 11;
