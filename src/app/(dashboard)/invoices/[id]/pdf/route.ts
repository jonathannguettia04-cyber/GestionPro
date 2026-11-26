import { getSessionContext } from "@/lib/auth/session";
import { buildDocumentPdf } from "@/lib/pdf/document";
import { forbidden, notFoundResponse, pdfResponse } from "@/lib/pdf/response";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx?.organization || !ctx.permissions.includes("invoices.export")) return forbidden();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFoundResponse();
  const supabase = await createClient();
  const { data: inv } = await supabase.from("invoices").select("*").eq("id", id).eq("organization_id", ctx.organization.id).maybeSingle();
  if (!inv || !inv.number) return notFoundResponse();            // seules les factures émises ont un PDF officiel
  const [{ data: items }, { data: client }, { data: org }] = await Promise.all([
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position"),
    supabase.from("clients").select("name, email, phone, address").eq("id", inv.client_id).maybeSingle(),
    supabase.from("organizations").select("name, address, phone, email").eq("id", ctx.organization.id).maybeSingle(),
  ]);
  const bytes = await buildDocumentPdf({
    kind: "invoice", number: inv.number, currency: ctx.organization.currency, org: org ?? { name: ctx.organization.name }, client: client ?? { name: "—" },
    issueDate: inv.issue_date, secondDateLabel: "Échéance le", secondDate: inv.due_date,
    items: (items ?? []).map((i: any) => ({ description: i.description, quantity: Number(i.quantity), unit: i.unit, unit_price: Number(i.unit_price),
      discount_rate: Number(i.discount_rate), tax_rate: Number(i.tax_rate), line_subtotal: Number(i.line_subtotal) })),
    totals: { subtotal: Number(inv.subtotal), discount: Number(inv.discount_total), tax: Number(inv.tax_total), total: Number(inv.total), paid: Number(inv.amount_paid) }, notes: inv.notes,
  });
  return pdfResponse(bytes, inv.number);
}
