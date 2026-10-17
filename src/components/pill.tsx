import { STATUS_LABEL } from "@/lib/billing/constants";
import type { InvoiceStatusKey } from "@/lib/billing/types";

export function StatusPill({ st, style }: { st: InvoiceStatusKey; style?: React.CSSProperties }) {
  return <span className={`pill ${st}`} style={style}>{STATUS_LABEL[st]}</span>;
}
