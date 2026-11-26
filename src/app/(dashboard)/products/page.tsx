import { Flash } from "@/components/ui/flash";
import { requirePermission } from "@/lib/auth/guard";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { saveProductAction } from "./actions";

export const metadata = { title: "Produits et services" };
const field = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";
const btn = "rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark";

function Fields({ p, tax }: { p?: any; tax: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <input name="reference" placeholder="Référence" aria-label="Référence" defaultValue={p?.reference ?? ""} maxLength={40} className={field} />
      <input name="name" required placeholder="Désignation" aria-label="Désignation" defaultValue={p?.name} minLength={2} maxLength={150} className={`${field} sm:col-span-2`} />
      <input name="category" placeholder="Catégorie" aria-label="Catégorie" defaultValue={p?.category ?? ""} maxLength={60} className={field} />
      <input name="unit" required placeholder="Unité" aria-label="Unité" defaultValue={p?.unit ?? "unité"} maxLength={20} className={field} />
      <input name="unit_price" type="number" min="0" step="any" required placeholder="Prix unitaire" aria-label="Prix unitaire" defaultValue={p?.unit_price ?? ""} className={field} />
      <input name="tax_rate" type="number" min="0" max="100" step="any" required placeholder="Taxe %" aria-label="Taxe %" defaultValue={p?.tax_rate ?? tax} className={field} />
      <input name="description" placeholder="Description" aria-label="Description" defaultValue={p?.description ?? ""} maxLength={500} className={`${field} sm:col-span-2`} />
    </div>
  );
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("catalog.view");
  const supabase = await createClient();
  const { data: items } = await supabase.from("catalog_items").select("id, reference, name, description, category, unit, unit_price, tax_rate, is_active")
    .eq("organization_id", ctx.organization.id).order("category", { nullsFirst: false }).order("name");
  const { data: org } = await supabase.from("organizations").select("billing_settings").eq("id", ctx.organization.id).maybeSingle();
  const tax = Number((org?.billing_settings as any)?.default_tax_rate ?? 0);
  const cur = ctx.organization.currency;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Flash ok={sp.ok} err={sp.err} />
      <h1 className="text-2xl font-semibold tracking-tight">Produits et services</h1>
      {ctx.permissions.includes("catalog.create") && (
        <details className="rounded-xl border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold">Nouvel article</summary>
          <form action={saveProductAction} className="mt-4 space-y-3"><Fields tax={tax} /><button className={btn}>Ajouter l'article</button></form>
        </details>
      )}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {(items ?? []).length === 0 && <li className="p-5 text-sm text-slate-500">Catalogue vide.</li>}
        {(items ?? []).map((p: any) => (
          <li key={p.id} className="p-4">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                <span><span className="font-medium">{p.name}</span>{p.reference && <span className="ml-2 text-xs text-slate-500">{p.reference}</span>}{!p.is_active && <span className="ml-2 text-xs text-slate-500">(inactif)</span>}
                  <span className="block text-xs text-slate-500">{p.category ?? "Sans catégorie"} · {p.unit} · taxe {Number(p.tax_rate)} %</span></span>
                <span className="font-medium">{formatMoney(p.unit_price, cur)}</span>
              </summary>
              {ctx.permissions.includes("catalog.edit") && (
                <form action={saveProductAction} className="mt-4 space-y-3">
                  <input type="hidden" name="id" value={p.id} /><Fields p={p} tax={tax} />
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={p.is_active} className="accent-brand" />Article actif</label>
                  <button className={btn}>Enregistrer</button>
                </form>
              )}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
