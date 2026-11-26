import { Flash } from "@/components/ui/flash";
import { requirePermission } from "@/lib/auth/guard";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { saveClientAction } from "./actions";

export const metadata = { title: "Clients" };
const field = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";
const btn = "rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark";

function ClientFields({ c, depts }: { c?: any; depts: any[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <input name="name" required minLength={2} maxLength={150} placeholder="Nom" aria-label="Nom" defaultValue={c?.name} className={field} />
      <input name="email" type="email" placeholder="E-mail" aria-label="E-mail" defaultValue={c?.email ?? ""} className={field} />
      <input name="phone" placeholder="Téléphone" aria-label="Téléphone" defaultValue={c?.phone ?? ""} className={field} />
      <select name="department" aria-label="Département" defaultValue={c?.department_id ?? ""} className={field}>
        <option value="">Visible par toute l'entreprise</option>{depts.map((d) => <option key={d.id} value={d.id}>Réservé à : {d.name}</option>)}</select>
      <input name="address" placeholder="Adresse" aria-label="Adresse" defaultValue={c?.address ?? ""} className={`${field} sm:col-span-2`} />
      <textarea name="notes" rows={2} placeholder="Notes" aria-label="Notes" defaultValue={c?.notes ?? ""} className={`${field} sm:col-span-2`} />
    </div>
  );
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("clients.view");
  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const q = (sp.q ?? "").trim().replace(/[%,()]/g, " ").slice(0, 60);

  let query = supabase.from("clients").select("id, name, email, phone, address, notes, department_id, is_active").eq("organization_id", orgId).order("name");
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  const [{ data: clients }, { data: depts }, { data: invs }] = await Promise.all([
    query,
    supabase.from("departments").select("id, name").eq("organization_id", orgId).eq("is_active", true).order("name"),
    ctx.permissions.includes("invoices.view")
      ? supabase.from("invoices").select("client_id, total, status").eq("organization_id", orgId).in("status", ["issued", "partially_paid", "paid"])
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const billed = new Map<string, number>();
  (invs ?? []).forEach((i: any) => billed.set(i.client_id, (billed.get(i.client_id) ?? 0) + Number(i.total)));
  const canCreate = ctx.permissions.includes("clients.create");
  const canEdit = ctx.permissions.includes("clients.edit");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Flash ok={sp.ok} err={sp.err} />
      <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
      <form className="flex gap-2" role="search"><input name="q" defaultValue={q} placeholder="Rechercher un nom, e-mail ou téléphone" aria-label="Rechercher" className={field} /><button className={btn}>Rechercher</button></form>

      {canCreate && (
        <details className="rounded-xl border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold">Nouveau client</summary>
          <form action={saveClientAction} className="mt-4 space-y-3"><ClientFields depts={depts ?? []} /><button className={btn}>Ajouter le client</button></form>
        </details>
      )}

      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {(clients ?? []).length === 0 && <li className="p-5 text-sm text-slate-500">{q ? "Aucun résultat." : "Aucun client visible pour le moment."}</li>}
        {(clients ?? []).map((c: any) => (
          <li key={c.id} className="p-4">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                <span><span className="font-medium">{c.name}</span>{!c.is_active && <span className="ml-2 text-xs text-slate-500">(inactif)</span>}
                  <span className="block text-xs text-slate-500">{[c.email, c.phone].filter(Boolean).join(" · ") || "Aucune coordonnée"}</span></span>
                {ctx.permissions.includes("invoices.view") && <span className="text-xs text-slate-500">Facturé : {formatMoney(billed.get(c.id) ?? 0, ctx.organization.currency)}</span>}
              </summary>
              {canEdit ? (
                <form action={saveClientAction} className="mt-4 space-y-3">
                  <input type="hidden" name="id" value={c.id} /><ClientFields c={c} depts={depts ?? []} />
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={c.is_active} className="accent-brand" />Client actif</label>
                  <button className={btn}>Enregistrer</button>
                </form>
              ) : <p className="mt-3 text-sm text-slate-600">{c.address}{c.notes ? ` — ${c.notes}` : ""}</p>}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
