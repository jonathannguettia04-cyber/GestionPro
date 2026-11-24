"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { requireContext } from "@/lib/auth/guard";
import { dbMessage, flashRedirect } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/types/forms";

const uuid = z.string().uuid();
const roleEnum = z.enum(["admin", "department_manager", "member"]);

export type InviteState = (NonNullable<FormState> & { link?: string }) | undefined;

export async function inviteAction(_: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await requireContext();
  const parsed = z.object({
    email: z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(254),
    role: roleEnum,
    department: z.string().optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const dept = parsed.data.department && uuid.safeParse(parsed.data.department).success ? parsed.data.department : null;

  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_invitation", {
    p_org: ctx.organization.id, p_email: parsed.data.email, p_role: parsed.data.role, p_department: dept,
  });
  if (error || typeof token !== "string") return { error: dbMessage(error ?? { message: "" }, "Invitation impossible.") };

  const h = await headers();
  const base = process.env.NEXT_PUBLIC_SITE_URL || h.get("origin") || "";
  // Le lien n'est affiché qu'une fois : seul son hash est conservé en base.
  return { success: `Invitation prête pour ${parsed.data.email}. Transmettez-lui ce lien (valable 7 jours) :`, link: `${base}/invite/${token}` };
}

export async function revokeInvitationAction(formData: FormData) {
  await requireContext();
  const id = String(formData.get("id") ?? "");
  if (!uuid.safeParse(id).success) flashRedirect("/employees", "err", "Invitation invalide.");
  const supabase = await createClient();
  const { error } = await supabase.from("invitations").update({ status: "revoked" }).eq("id", id).eq("status", "pending");
  if (error) flashRedirect("/employees", "err", dbMessage(error, "Révocation impossible."));
  flashRedirect("/employees", "ok", "Invitation révoquée.");
}

export async function updateMemberAction(formData: FormData) {
  await requireContext();
  const id = String(formData.get("id") ?? "");
  const back = `/employees/${id}`;
  if (!uuid.safeParse(id).success) flashRedirect("/employees", "err", "Collaborateur invalide.");
  const role = roleEnum.safeParse(formData.get("role"));
  const status = z.enum(["active", "revoked"]).safeParse(formData.get("status"));
  if (!role.success || !status.success) flashRedirect(back, "err", "Valeurs invalides.");

  const supabase = await createClient();
  const { data, error } = await supabase.from("memberships").update({ role: role.data, status: status.data }).eq("id", id).select("id");
  if (error) flashRedirect(back, "err", dbMessage(error, "Modification impossible."));
  if (!data || data.length === 0) flashRedirect(back, "err", "Modification non autorisée pour ce collaborateur.");
  flashRedirect(back, "ok", "Collaborateur mis à jour.");
}

export async function setOverrideAction(formData: FormData) {
  const ctx = await requireContext();
  const id = String(formData.get("id") ?? "");
  const back = `/employees/${id}`;
  const parsed = z.object({
    id: uuid, code: z.string().regex(/^[a-z]+\.[a-z]+$/), effect: z.enum(["grant", "deny"]),
    expires: z.string().optional(),
  }).safeParse({ id, code: formData.get("code"), effect: formData.get("effect"), expires: formData.get("expires") || undefined });
  if (!parsed.success) flashRedirect(back, "err", "Valeurs invalides.");
  const expires = parsed.data!.expires ? new Date(`${parsed.data!.expires}T23:59:59`) : null;
  if (expires && (Number.isNaN(expires.getTime()) || expires.getTime() <= Date.now())) flashRedirect(back, "err", "La date d'expiration doit être dans le futur.");

  const supabase = await createClient();
  const expiresAt = expires ? expires.toISOString() : null;
  // Pas d'upsert : seules les colonnes effect/expires_at sont modifiables (droits au niveau colonne).
  const { data: existing } = await supabase.from("member_permissions").select("id")
    .eq("membership_id", id).eq("permission_code", parsed.data!.code).maybeSingle();
  const { error } = existing
    ? await supabase.from("member_permissions").update({ effect: parsed.data!.effect, expires_at: expiresAt }).eq("id", existing.id)
    : await supabase.from("member_permissions").insert({
        organization_id: ctx.organization.id, membership_id: id, permission_code: parsed.data!.code,
        effect: parsed.data!.effect, expires_at: expiresAt, created_by: ctx.user.id });
  if (error) flashRedirect(back, "err", dbMessage(error, "Autorisation impossible."));
  flashRedirect(back, "ok", "Autorisation individuelle enregistrée.");
}

export async function removeOverrideAction(formData: FormData) {
  await requireContext();
  const id = String(formData.get("id") ?? "");
  const overrideId = String(formData.get("override") ?? "");
  const back = `/employees/${id}`;
  if (!uuid.safeParse(overrideId).success) flashRedirect(back, "err", "Valeurs invalides.");
  const supabase = await createClient();
  const { error } = await supabase.from("member_permissions").delete().eq("id", overrideId);
  if (error) flashRedirect(back, "err", dbMessage(error, "Suppression impossible."));
  flashRedirect(back, "ok", "Autorisation individuelle supprimée.");
}

export async function grantDepartmentAccessAction(formData: FormData) {
  const ctx = await requireContext();
  const id = String(formData.get("id") ?? "");
  const dept = String(formData.get("department") ?? "");
  const back = `/employees/${id}`;
  if (!uuid.safeParse(id).success || !uuid.safeParse(dept).success) flashRedirect(back, "err", "Valeurs invalides.");
  const expiresRaw = String(formData.get("expires") ?? "");
  const expires = expiresRaw ? new Date(`${expiresRaw}T23:59:59`) : null;
  if (expires && (Number.isNaN(expires.getTime()) || expires.getTime() <= Date.now())) flashRedirect(back, "err", "La date d'expiration doit être dans le futur.");

  const supabase = await createClient();
  const { error } = await supabase.from("department_access_grants").insert({
    organization_id: ctx.organization.id, membership_id: id, department_id: dept,
    expires_at: expires ? expires.toISOString() : null, granted_by: ctx.user.id,
  });
  if (error) flashRedirect(back, "err", dbMessage(error, "Accès impossible à accorder."));
  flashRedirect(back, "ok", "Accès transversal accordé.");
}

export async function revokeDepartmentAccessAction(formData: FormData) {
  await requireContext();
  const id = String(formData.get("id") ?? "");
  const grant = String(formData.get("grant") ?? "");
  const back = `/employees/${id}`;
  if (!uuid.safeParse(grant).success) flashRedirect(back, "err", "Valeurs invalides.");
  const supabase = await createClient();
  const { error } = await supabase.from("department_access_grants").update({ revoked_at: new Date().toISOString() }).eq("id", grant);
  if (error) flashRedirect(back, "err", dbMessage(error, "Révocation impossible."));
  flashRedirect(back, "ok", "Accès transversal révoqué.");
}
