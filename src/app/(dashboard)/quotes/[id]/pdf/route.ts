import { buildDocumentPdf } from "@/lib/pdf/document";
import { forbidden, notFoundResponse, pdfResponse } from "@/lib/pdf/response";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx?.organization || !ctx.permissions.includes("quotes.export")) return forbidden();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFoundResponse();
  const supabase = await createClient();
  const { data: q } = await supabase.from("quotes").select("*").eq("id", id).eq("organization_id", ctx.organization.id).maybeSingle();
  if (!q) return notFoundResponse();
  const [{ data: items }, { data: client }, { data: org }] = await Promise.all([
    supabase.from("quote_items").select("*").eq("quote_id", id).order("position"),
    supabase.from("clients").select("name, email, phone, address").eq("id", q.client_id).maybeSingle(),
    supabase.from("organizations").select("name, address, phone, email").eq("id", ctx.organization.id).maybeSingle(),
  ]);
  const bytes = await buildDocumentPdf({
    kind: "quote", number: q.number, currency: ctx.organization.currency, org: org ?? { name: ctx.organization.name }, client: client ?? { name: "—" },
    issueDate: q.issue_date, secondDateLabel: "Valable jusqu'au", secondDate: q.valid_until,
    items: (items ?? []).map((i: any) => ({ description: i.description, quantity: Number(i.quantity), unit: i.unit, unit_price: Number(i.unit_price),
      discount_rate: Number(i.discount_rate), tax_rate: Number(i.tax_rate), line_subtotal: Number(i.line_subtotal) })),
    totals: { subtotal: Number(q.subtotal), discount: Number(q.discount_total), tax: Number(q.tax_total), total: Number(q.total) }, notes: q.notes,
  });
  return pdfResponse(bytes, q.number);
}
