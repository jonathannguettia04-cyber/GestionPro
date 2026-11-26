import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadFormData(supabase: SupabaseClient, orgId: string) {
  const [{ data: clients }, { data: departments }, { data: catalog }, { data: org }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("organization_id", orgId).eq("is_active", true).order("name"),
    supabase.from("departments").select("id, name").eq("organization_id", orgId).eq("is_active", true).order("name"),
    supabase.from("catalog_items").select("id, name, unit, unit_price, tax_rate").eq("organization_id", orgId).eq("is_active", true).order("name"),
    supabase.from("organizations").select("billing_settings").eq("id", orgId).maybeSingle(),
  ]);
  return {
    clients: (clients ?? []) as { id: string; name: string }[],
    departments: (departments ?? []) as { id: string; name: string }[],
    catalog: (catalog ?? []).map((c: any) => ({ ...c, unit_price: Number(c.unit_price), tax_rate: Number(c.tax_rate) })),
    defaultTax: Number((org?.billing_settings as any)?.default_tax_rate ?? 0),
  };
}
