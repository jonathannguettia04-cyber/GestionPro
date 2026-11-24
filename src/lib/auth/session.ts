import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type MemberRole = "owner" | "admin" | "department_manager" | "member";

export const getSessionContext = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("memberships")
      .select("id, role, organizations(id, name, sector, currency, timezone, status)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const rawOrg = membership?.organizations as unknown;
  const organization = (Array.isArray(rawOrg) ? rawOrg[0] : rawOrg) as
    | { id: string; name: string; sector: string; currency: string; timezone: string; status: string }
    | null
    | undefined;
  return {
    user,
    fullName: profile?.full_name || user.email || "Utilisateur",
    membership: membership && organization ? { id: membership.id as string, role: membership.role as MemberRole } : null,
    organization: organization ?? null,
  };
});
