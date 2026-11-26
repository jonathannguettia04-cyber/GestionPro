"use server";

import { z } from "zod";
import { requireContext } from "@/lib/auth/guard";
import { dbMessage, flashRedirect } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const schema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères.").max(150),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("E-mail invalide.").max(254)]),
  phone: z.string().trim().max(30),
  address: z.string().trim().max(300),
  notes: z.string().trim().max(1000),
});

export async function saveClientAction(formData: FormData) {
  const ctx = await requireContext();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) flashRedirect("/clients", "err", parsed.error.issues[0].message);
  const id = String(formData.get("id") ?? "");
  const dept = String(formData.get("department") ?? "");
  const row = {
    name: parsed.data!.name, email: parsed.data!.email || null, phone: parsed.data!.phone || null,
    address: parsed.data!.address || null, notes: parsed.data!.notes || null,
    department_id: uuid.safeParse(dept).success ? dept : null,
    is_active: id ? formData.get("is_active") === "on" : true,
  };
  const supabase = await createClient();
  if (id) {
    if (!uuid.safeParse(id).success) flashRedirect("/clients", "err", "Client invalide.");
    const { data, error } = await supabase.from("clients").update(row).eq("id", id).select("id");
    if (error) flashRedirect("/clients", "err", dbMessage(error, "Modification impossible."));
    if (!data?.length) flashRedirect("/clients", "err", "Modification non autorisée.");
    flashRedirect("/clients", "ok", "Client mis à jour.");
  }
  const { error } = await supabase.from("clients").insert({ organization_id: ctx.organization.id, ...row });
  if (error) flashRedirect("/clients", "err", dbMessage(error, "Création impossible."));
  flashRedirect("/clients", "ok", "Client ajouté.");
}
