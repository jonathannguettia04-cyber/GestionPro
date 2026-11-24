"use server";

import { requireContext } from "@/lib/auth/guard";
import { dbMessage, flashRedirect } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const uuid = z.string().uuid();
const deptSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères.").max(80),
  description: z.string().trim().max(500).optional().default(""),
});

export async function createDepartmentAction(formData: FormData) {
  const ctx = await requireContext();
  const parsed = deptSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) flashRedirect("/departments", "err", parsed.error.issues[0].message);
  const manager = String(formData.get("manager") ?? "");

  const supabase = await createClient();
  // Identifiant généré ici : évite un SELECT de retour (le créateur n'a pas forcément accès au nouveau département).
  const id = crypto.randomUUID();
  const { error } = await supabase.from("departments")
    .insert({ id, organization_id: ctx.organization.id, name: parsed.data!.name, description: parsed.data!.description || null });
  if (error) flashRedirect("/departments", "err", dbMessage(error, "Création impossible."));
  if (manager && uuid.safeParse(manager).success) {
    const { error: e2 } = await supabase.from("departments").update({ manager_membership_id: manager }).eq("id", id);
    if (e2) flashRedirect("/departments", "err", "Département créé, mais le responsable n'a pas pu être désigné.");
  }
  flashRedirect("/departments", "ok", "Département créé.");
}

export async function updateDepartmentAction(formData: FormData) {
  await requireContext();
  const id = String(formData.get("id") ?? "");
  const back = `/departments/${id}`;
  if (!uuid.safeParse(id).success) flashRedirect("/departments", "err", "Département invalide.");
  const parsed = deptSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) flashRedirect(back, "err", parsed.error.issues[0].message);
  const manager = String(formData.get("manager") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.from("departments").update({
    name: parsed.data!.name,
    description: parsed.data!.description || null,
    is_active: formData.get("is_active") === "on",
    manager_membership_id: manager && uuid.safeParse(manager).success ? manager : null,
  }).eq("id", id);
  if (error) flashRedirect(back, "err", dbMessage(error, "Modification impossible."));
  flashRedirect(back, "ok", "Département mis à jour.");
}

export async function addDepartmentMemberAction(formData: FormData) {
  const ctx = await requireContext();
  const id = String(formData.get("id") ?? "");
  const membership = String(formData.get("membership") ?? "");
  const back = `/departments/${id}`;
  if (!uuid.safeParse(id).success || !uuid.safeParse(membership).success) flashRedirect(back, "err", "Sélection invalide.");
  const supabase = await createClient();
  const { error } = await supabase.from("department_members")
    .insert({ department_id: id, membership_id: membership, organization_id: ctx.organization.id });
  if (error) flashRedirect(back, "err", dbMessage(error, "Affectation impossible."));
  flashRedirect(back, "ok", "Collaborateur affecté.");
}

export async function removeDepartmentMemberAction(formData: FormData) {
  await requireContext();
  const id = String(formData.get("id") ?? "");
  const membership = String(formData.get("membership") ?? "");
  const back = `/departments/${id}`;
  if (!uuid.safeParse(id).success || !uuid.safeParse(membership).success) flashRedirect(back, "err", "Sélection invalide.");
  const supabase = await createClient();
  const { error } = await supabase.from("department_members").delete().eq("department_id", id).eq("membership_id", membership);
  if (error) flashRedirect(back, "err", dbMessage(error, "Retrait impossible."));
  flashRedirect(back, "ok", "Collaborateur retiré du département.");
}
