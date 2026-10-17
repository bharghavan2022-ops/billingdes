"use client";
import { useParams } from "next/navigation";
import { InvoiceEditor } from "@/components/invoice-editor";

export default function EditBillPage() {
  const { id } = useParams<{ id: string }>();
  return <InvoiceEditor mode="edit" id={id} />;
}
