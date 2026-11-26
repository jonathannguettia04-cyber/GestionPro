"use server";

import { z } from "zod";
import { requireContext } from "@/lib/auth/guard";
import { dbMessage, flashRedirect } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const schema = z.object({
  reference: z.string().trim().max(40),
  name: z.string().trim().min(2, "La désignation doit contenir au moins 2 caractères.").max(150),
  description: z.string().trim().max(500),
  category: z.string().trim().max(60),
  unit: z.string().trim().min(1, "Unité obligatoire.").max(20),
  unit_price: z.coerce.number({ invalid_type_error: "Prix invalide." }).min(0, "Le prix doit être positif.").max(999999999999),
  tax_rate: z.coerce.number().min(0, "Taxe invalide.").max(100, "Taxe invalide."),
});

export async function saveProductAction(formData: FormData) {
  const ctx = await requireContext();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) flashRedirect("/products", "err", parsed.error.issues[0].message);
  const id = String(formData.get("id") ?? "");
  const p = parsed.data!;
  const row = { reference: p.reference || null, name: p.name, description: p.description || null, category: p.category || null,
    unit: p.unit, unit_price: p.unit_price, tax_rate: p.tax_rate, is_active: id ? formData.get("is_active") === "on" : true };
  const supabase = await createClient();
  if (id) {
    if (!uuid.safeParse(id).success) flashRedirect("/products", "err", "Article invalide.");
    const { data, error } = await supabase.from("catalog_items").update(row).eq("id", id).select("id");
    if (error) flashRedirect("/products", "err", dbMessage(error, "Modification impossible."));
    if (!data?.length) flashRedirect("/products", "err", "Modification non autorisée.");
    flashRedirect("/products", "ok", "Article mis à jour.");
  }
  const { error } = await supabase.from("catalog_items").insert({ organization_id: ctx.organization.id, ...row });
  if (error) flashRedirect("/products", "err", error.code === "23505" ? "Cette référence existe déjà." : dbMessage(error, "Création impossible."));
  flashRedirect("/products", "ok", "Article ajouté.");
}
