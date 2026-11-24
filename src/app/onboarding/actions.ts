"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { organizationPayloadSchema } from "@/lib/validations/organization";
import type { FormState } from "@/types/forms";

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_LOGO = 2 * 1024 * 1024;

export async function createOrganizationAction(_: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let raw: unknown;
  try { raw = JSON.parse(String(formData.get("payload") ?? "{}")); } catch { return { error: "Données invalides." }; }
  const parsed = organizationPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message ?? "Vérifiez les informations saisies." };
  }
  const p = parsed.data;

  const logo = formData.get("logo");
  const hasLogo = logo instanceof File && logo.size > 0;
  if (hasLogo) {
    if (!LOGO_TYPES[logo.type]) return { error: "Logo : formats acceptés PNG, JPEG ou WebP." };
    if (logo.size > MAX_LOGO) return { error: "Logo : 2 Mo maximum." };
  }

  // Création atomique côté base (entreprise + propriétaire + départements + invitations + journal).
  const { data: orgId, error } = await supabase.rpc("create_organization", {
    p_name: p.name, p_sector: p.sector, p_phone: p.phone, p_address: p.address, p_email: p.email,
    p_timezone: p.timezone, p_billing: p.billing,
    p_departments: p.departments.filter((d) => d.name !== ""),
    p_invites: p.invites.filter((i) => i.email !== ""),
  });
  if (error || !orgId) {
    if (error?.message.includes("organization_limit_reached")) return { error: "Limite d'entreprises atteinte pour ce compte." };
    return { error: "La création de l'entreprise a échoué. Aucune donnée n'a été enregistrée, réessayez." };
  }

  if (hasLogo) {
    const path = `${orgId}/logo-${Date.now()}.${LOGO_TYPES[logo.type]}`;
    const up = await supabase.storage.from("organization-assets").upload(path, logo, { contentType: logo.type });
    if (!up.error) await supabase.from("organizations").update({ logo_path: path }).eq("id", orgId);
    // Échec du logo non bloquant : modifiable ensuite dans les paramètres.
  }
  redirect("/dashboard");
}
