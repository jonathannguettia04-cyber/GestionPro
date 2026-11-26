import { notFound, redirect } from "next/navigation";
import { DocumentForm } from "@/components/commercial/document-form";
import { requirePermission } from "@/lib/auth/guard";
import { loadFormData } from "@/lib/commercial/data";
import { createClient } from "@/lib/supabase/server";
import { saveInvoiceAction } from "../../actions";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("invoices.edit");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: q } = await supabase.from("invoices").select("id, number, status, client_id, department_id, notes").eq("id", id).eq("organization_id", ctx.organization.id).maybeSingle();
  if (!q) notFound();
  if (q.status !== "draft") redirect(`/invoices/${id}?err=${encodeURIComponent("Cette facture n'est plus modifiable.")}`);
  const { data: items } = await supabase.from("invoice_items").select("description, quantity, unit, unit_price, discount_rate, tax_rate, catalog_item_id").eq("invoice_id", id).order("position");
  const d = await loadFormData(supabase, ctx.organization.id);
  const init = (items ?? []).map((i: any) => ({ description: i.description, quantity: String(Number(i.quantity)), unit: i.unit, unit_price: String(Number(i.unit_price)),
    discount_rate: String(Number(i.discount_rate)), tax_rate: String(Number(i.tax_rate)), catalog_item_id: i.catalog_item_id ?? undefined }));
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Modifier la facture brouillon</h1>
      <DocumentForm kind="invoice" action={saveInvoiceAction} documentId={q.id} currency={ctx.organization.currency} {...d}
        initial={{ client_id: q.client_id, department_id: q.department_id, notes: q.notes, items: init }} />
    </div>
  );
}
