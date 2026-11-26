"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireContext } from "@/lib/auth/guard";
import { parseItems } from "@/lib/commercial/schemas";
import { dbMessage, flashRedirect } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/types/forms";

const uuid = z.string().uuid();
const opt = (v: FormDataEntryValue | null) => (uuid.safeParse(v).success ? String(v) : null);

export async function saveInvoiceAction(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext();
  const items = parseItems(formData.get("items"));
  if (!items.success) return { error: items.error.issues[0]?.message ?? "Lignes invalides." };
  const client = opt(formData.get("client"));
  if (!client) return { error: "Choisissez un client." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_invoice", {
    p_org: ctx.organization.id, p_invoice: opt(formData.get("id")), p_client: client, p_department: opt(formData.get("department")),
    p_notes: String(formData.get("notes") ?? ""), p_items: items.data,
  });
  if (error || typeof data !== "string") return { error: dbMessage(error ?? { message: "" }, "Enregistrement impossible.") };
  redirect(`/invoices/${data}?ok=${encodeURIComponent("Facture enregistrée.")}`);
}

export async function invoiceActionForm(formData: FormData) {
  await requireContext();
  const id = String(formData.get("id") ?? "");
  const op = z.enum(["issue", "cancel"]).safeParse(formData.get("op"));
  if (!uuid.safeParse(id).success || !op.success) flashRedirect("/invoices", "err", "Demande invalide.");
  const supabase = await createClient();
  const { error } = op.data === "issue" ? await supabase.rpc("issue_invoice", { p_invoice: id }) : await supabase.rpc("cancel_invoice", { p_invoice: id });
  if (error) flashRedirect(`/invoices/${id}`, "err", dbMessage(error, "Opération impossible."));
  flashRedirect(`/invoices/${id}`, "ok", op.data === "issue" ? "Facture émise et numérotée." : "Facture annulée.");
}

export async function recordPaymentAction(formData: FormData) {
  await requireContext();
  const id = String(formData.get("id") ?? "");
  const parsed = z.object({
    amount: z.coerce.number({ invalid_type_error: "Montant invalide." }).positive("Montant invalide."),
    method: z.enum(["cash", "bank_transfer", "mobile_money", "cheque", "card", "other"]),
    paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide."),
    reference: z.string().trim().max(100),
  }).safeParse(Object.fromEntries(formData));
  if (!uuid.safeParse(id).success) flashRedirect("/invoices", "err", "Facture invalide.");
  if (!parsed.success) flashRedirect(`/invoices/${id}`, "err", parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_payment", {
    p_invoice: id, p_amount: parsed.data.amount, p_method: parsed.data.method, p_paid_at: parsed.data.paid_at,
    p_reference: parsed.data.reference, p_is_deposit: formData.get("is_deposit") === "on",
  });
  if (error) flashRedirect(`/invoices/${id}`, "err", dbMessage(error, "Paiement impossible."));
  flashRedirect(`/invoices/${id}`, "ok", "Paiement enregistré.");
}
