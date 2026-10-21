import type { BusinessDetails } from "./types";

export type Lang = "en" | "ta";

/** Words printed on the bill, in English and Tamil. Keys are the English wording. */
const TA: Record<string, string> = {
  "Invoice No.": "விலைப்பட்டியல் எண்", "Invoice Date": "தேதி", "Due Date": "செலுத்த வேண்டிய தேதி",
  "BILL TO": "வாங்குபவர்", "SHIP TO": "அனுப்ப வேண்டிய முகவரி",
  "Mobile": "கைபேசி", "GSTIN": "ஜி.எஸ்.டி.ஐ.என்", "PAN Number": "பான் எண்", "Place of Supply": "வழங்கும் இடம்",
  "S.NO.": "வ.எண்", "ITEMS": "பொருட்கள்", "HSN": "எச்.எஸ்.என்", "QTY.": "அளவு", "RATE": "விலை", "DISC.": "தள்ளுபடி", "TAX": "வரி", "AMOUNT": "தொகை",
  "SUBTOTAL": "துணை மொத்தம்", "Continued on next page": "அடுத்த பக்கத்தில் தொடர்கிறது",
  "BANK DETAILS": "வங்கி விவரங்கள்", "Name": "பெயர்", "IFSC Code": "ஐ.எஃப்.எஸ்.சி குறியீடு", "Account No": "கணக்கு எண்", "Customer ID": "வாடிக்கையாளர் எண்", "Bank": "வங்கி",
  "NOTES": "குறிப்புகள்", "TERMS AND CONDITIONS": "விதிமுறைகள்",
  "Taxable Amount": "வரிக்குட்பட்ட தொகை", "Round Off": "முழுமையாக்கல்", "Total Amount": "மொத்தத் தொகை", "Received Amount": "பெறப்பட்ட தொகை", "Balance Due": "நிலுவைத் தொகை",
  "Total Amount (in words)": "மொத்தத் தொகை (எழுத்தில்)", "Authorised Signature for": "அங்கீகரிக்கப்பட்ட கையொப்பம் –",
  "Page": "பக்கம்", "of": "/",
};

/** Translate a printed label; English (or an unknown label) comes back unchanged. */
export const tr = (lang: Lang | undefined, s: string) => (lang === "ta" && TA[s]) || s;

export const HEADING = { en: "TAX INVOICE", ta: "வரி விலைப்பட்டியல்" } as const;
export const BILL_FROM = { en: "Bill from", ta: "பில் வழங்குபவர்" } as const;

/** The firm name and address to print: the Tamil ones when the bill is in Tamil and they have been filled in. */
export function bizFor(b: BusinessDetails, lang: Lang | undefined) {
  return lang === "ta" ? { ...b, name: b.nameTa?.trim() || b.name, address: b.addressTa?.trim() || b.address } : b;
}

const TAMIL_SCRIPT = /[\u0B80-\u0BFF]/;
/** The heading to show after the bill language changes to `l`: the new language's default, unless the current heading is already a custom one in that language. */
export function headingFor(current: string, l: Lang): string {
  const h = current.trim();
  if (!h) return HEADING[l];
  if (l === "en") return TAMIL_SCRIPT.test(h) ? HEADING.en : h;
  return h === HEADING.en ? HEADING.ta : h;
}
