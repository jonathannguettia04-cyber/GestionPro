"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function setActiveOrganization(orgId: string) {
  (await cookies()).set("gp_org", orgId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function switchOrganizationAction(formData: FormData) {
  const orgId = String(formData.get("orgId") ?? "");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // L'appartenance est vérifiée via RLS : on ne peut cibler qu'une entreprise dont on est membre actif.
  const { data } = await supabase.from("memberships").select("id").eq("user_id", user.id).eq("organization_id", orgId).eq("status", "active").maybeSingle();
  if (data) await setActiveOrganization(orgId);
  redirect("/dashboard");
}
