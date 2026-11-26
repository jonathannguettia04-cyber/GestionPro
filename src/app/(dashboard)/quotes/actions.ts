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

export async function saveQuoteAction(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext();
  const items = parseItems(formData.get("items"));
  if (!items.success) return { error: items.error.issues[0]?.message ?? "Lignes invalides." };
  const client = opt(formData.get("client"));
  if (!client) return { error: "Choisissez un client." };
  const until = String(formData.get("valid_until") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_quote", {
    p_org: ctx.organization.id, p_quote: opt(formData.get("id")), p_client: client, p_department: opt(formData.get("department")),
    p_valid_until: /^\d{4}-\d{2}-\d{2}$/.test(until) ? until : null, p_notes: String(formData.get("notes") ?? ""), p_items: items.data,
  });
  if (error || typeof data !== "string") return { error: dbMessage(error ?? { message: "" }, "Enregistrement impossible.") };
  redirect(`/quotes/${data}?ok=${encodeURIComponent("Devis enregistré.")}`);
}

export async function quoteStatusAction(formData: FormData) {
  await requireContext();
  const id = String(formData.get("id") ?? "");
  const status = z.enum(["sent", "accepted", "rejected", "expired"]).safeParse(formData.get("status"));
  if (!uuid.safeParse(id).success || !status.success) flashRedirect("/quotes", "err", "Demande invalide.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_quote_status", { p_quote: id, p_status: status.data });
  if (error) flashRedirect(`/quotes/${id}`, "err", dbMessage(error, "Changement de statut impossible."));
  flashRedirect(`/quotes/${id}`, "ok", "Statut du devis mis à jour.");
}

export async function convertQuoteAction(formData: FormData) {
  await requireContext();
  const id = String(formData.get("id") ?? "");
  if (!uuid.safeParse(id).success) flashRedirect("/quotes", "err", "Demande invalide.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("convert_quote_to_invoice", { p_quote: id });
  if (error || typeof data !== "string") flashRedirect(`/quotes/${id}`, "err", dbMessage(error ?? { message: "" }, "Conversion impossible."));
  redirect(`/invoices/${data}?ok=${encodeURIComponent("Facture brouillon créée à partir du devis.")}`);
}
