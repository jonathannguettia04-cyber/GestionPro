"use server";

import { z } from "zod";
import { requireContext } from "@/lib/auth/guard";
import { dbMessage, flashRedirect } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

export async function saveRolePermissionsAction(formData: FormData) {
  const ctx = await requireContext();
  const role = z.enum(["admin", "department_manager", "member"]).safeParse(formData.get("role"));
  const back = `/settings/permissions?role=${role.success ? role.data : "member"}`;
  if (!role.success) flashRedirect("/settings/permissions", "err", "Rôle invalide.");

  const wanted = new Set(formData.getAll("perm").map(String).filter((c) => /^[a-z]+\.[a-z]+$/.test(c)));
  const supabase = await createClient();
  const { data: current, error: e0 } = await supabase.from("role_permissions").select("permission_code")
    .eq("organization_id", ctx.organization.id).eq("role", role.data!);
  if (e0) flashRedirect(back, "err", dbMessage(e0));
  const have = new Set((current ?? []).map((r: any) => r.permission_code as string));

  const toAdd = [...wanted].filter((c) => !have.has(c));
  const toRemove = [...have].filter((c) => !wanted.has(c));

  if (toAdd.length) {
    const { error } = await supabase.from("role_permissions").insert(
      toAdd.map((permission_code) => ({ organization_id: ctx.organization.id, role: role.data!, permission_code })));
    if (error) flashRedirect(back, "err", dbMessage(error, "Enregistrement impossible : vous ne pouvez accorder que les permissions que vous possédez."));
  }
  if (toRemove.length) {
    const { error } = await supabase.from("role_permissions").delete()
      .eq("organization_id", ctx.organization.id).eq("role", role.data!).in("permission_code", toRemove);
    if (error) flashRedirect(back, "err", dbMessage(error));
  }
  flashRedirect(back, "ok", toAdd.length + toRemove.length ? "Permissions du rôle enregistrées." : "Aucun changement.");
}
