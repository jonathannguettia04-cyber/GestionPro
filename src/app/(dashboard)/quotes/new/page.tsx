import { DocumentForm } from "@/components/commercial/document-form";
import { requirePermission } from "@/lib/auth/guard";
import { loadFormData } from "@/lib/commercial/data";
import { createClient } from "@/lib/supabase/server";
import { saveQuoteAction } from "../actions";

export const metadata = { title: "Nouveau devis" };

export default async function NewQuotePage() {
  const ctx = await requirePermission("quotes.create");
  const d = await loadFormData(await createClient(), ctx.organization.id);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nouveau devis</h1>
      <DocumentForm kind="quote" action={saveQuoteAction} currency={ctx.organization.currency} {...d} />
    </div>
  );
}
