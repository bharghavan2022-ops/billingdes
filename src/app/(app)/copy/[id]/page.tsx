"use client";
import { useParams } from "next/navigation";
import { InvoiceEditor } from "@/components/invoice-editor";

export default function CopyBillPage() {
  const { id } = useParams<{ id: string }>();
  return <InvoiceEditor mode="copy" id={id} />;
}
