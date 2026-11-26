"use server";

import { z } from "zod";
import { requireContext } from "@/lib/auth/guard";
import { dbMessage, flashRedirect } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const RECEIPT_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" };

export async function createExpenseAction(formData: FormData) {
  const ctx = await requireContext();
  const parsed = z.object({
    category: z.string().trim().min(1, "Choisissez une catégorie.").max(60),
    description: z.string().trim().max(500),
    amount: z.coerce.number({ invalid_type_error: "Montant invalide." }).positive("Le montant doit être positif.").max(1e12),
    expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide."),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) flashRedirect("/expenses", "err", parsed.error.issues[0].message);

  const file = formData.get("receipt");
  const hasFile = file instanceof File && file.size > 0;
  if (hasFile && !RECEIPT_TYPES[file.type]) flashRedirect("/expenses", "err", "Justificatif : PNG, JPEG, WebP ou PDF uniquement.");
  if (hasFile && file.size > 5 * 1024 * 1024) flashRedirect("/expenses", "err", "Justificatif : 5 Mo maximum.");

  const supabase = await createClient();
  let path: string | null = null;
  if (hasFile) {
    path = `${ctx.organization.id}/${crypto.randomUUID()}.${RECEIPT_TYPES[file.type]}`;
    const up = await supabase.storage.from("expense-receipts").upload(path, file, { contentType: file.type });
    if (up.error) flashRedirect("/expenses", "err", "Le justificatif n'a pas pu être envoyé. La dépense n'a pas été créée.");
  }
  const dept = String(formData.get("department") ?? "");
  const resp = String(formData.get("responsible") ?? "");
  const { error } = await supabase.from("expenses").insert({
    organization_id: ctx.organization.id, category: parsed.data!.category, description: parsed.data!.description || null,
    amount: parsed.data!.amount, expense_date: parsed.data!.expense_date,
    department_id: uuid.safeParse(dept).success ? dept : null, responsible_membership_id: uuid.safeParse(resp).success ? resp : null, receipt_path: path,
  });
  if (error) {
    if (path) await supabase.storage.from("expense-receipts").remove([path]);
    flashRedirect("/expenses", "err", dbMessage(error, "Création impossible."));
  }
  flashRedirect("/expenses", "ok", "Dépense enregistrée, en attente de validation.");
}

export async function expenseStatusAction(formData: FormData) {
  await requireContext();
  const id = String(formData.get("id") ?? "");
  const status = z.enum(["approved", "rejected"]).safeParse(formData.get("status"));
  if (!uuid.safeParse(id).success || !status.success) flashRedirect("/expenses", "err", "Demande invalide.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_expense_status", { p_expense: id, p_status: status.data });
  if (error) flashRedirect("/expenses", "err", dbMessage(error, "Validation impossible."));
  flashRedirect("/expenses", "ok", status.data === "approved" ? "Dépense validée." : "Dépense refusée.");
}

export async function deleteExpenseAction(formData: FormData) {
  await requireContext();
  const id = String(formData.get("id") ?? "");
  if (!uuid.safeParse(id).success) flashRedirect("/expenses", "err", "Demande invalide.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("expenses").delete().eq("id", id).select("receipt_path");
  if (error) flashRedirect("/expenses", "err", dbMessage(error, "Suppression impossible."));
  if (!data?.length) flashRedirect("/expenses", "err", "Suppression non autorisée (une dépense validée ne peut pas être supprimée).");
  const path = data[0].receipt_path as string | null;
  if (path) await supabase.storage.from("expense-receipts").remove([path]);
  flashRedirect("/expenses", "ok", "Dépense supprimée.");
}
