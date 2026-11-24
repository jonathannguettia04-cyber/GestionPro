import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type MemberRole = "owner" | "admin" | "department_manager" | "member";
type Org = { id: string; name: string; sector: string; currency: string; timezone: string; status: string };

export const getSessionContext = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("memberships")
      .select("id, role, organizations(id, name, sector, currency, timezone, status)")
      .eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: true }),
  ]);

  const all = (rows ?? [])
    .map((r) => {
      const raw = r.organizations as unknown;
      const org = (Array.isArray(raw) ? raw[0] : raw) as Org | undefined;
      return org ? { membershipId: r.id as string, role: r.role as MemberRole, org } : null;
    })
    .filter((x): x is { membershipId: string; role: MemberRole; org: Org } => x !== null);

  const wanted = (await cookies()).get("gp_org")?.value;
  const current = all.find((x) => x.org.id === wanted) ?? all[0] ?? null;

  let permissions: string[] = [];
  if (current) {
    const { data } = await supabase.rpc("effective_permissions", { p_org: current.org.id });
    permissions = (data as string[] | null) ?? [];
  }

  return {
    user,
    fullName: (profile?.full_name as string) || user.email || "Utilisateur",
    membership: current ? { id: current.membershipId, role: current.role } : null,
    organization: current?.org ?? null,
    organizations: all.map((x) => ({ id: x.org.id, name: x.org.name })),
    permissions,
  };
});
