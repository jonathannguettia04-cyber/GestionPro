import { DocumentForm } from "@/components/commercial/document-form";
import { requirePermission } from "@/lib/auth/guard";
import { loadFormData } from "@/lib/commercial/data";
import { createClient } from "@/lib/supabase/server";
import { saveInvoiceAction } from "../actions";

export const metadata = { title: "Nouvelle facture" };

export default async function NewInvoicePage() {
  const ctx = await requirePermission("invoices.create");
  const d = await loadFormData(await createClient(), ctx.organization.id);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nouvelle facture</h1>
      <DocumentForm kind="invoice" action={saveInvoiceAction} currency={ctx.organization.currency} {...d} />
    </div>
  );
}
