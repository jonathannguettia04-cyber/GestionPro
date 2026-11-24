import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Tableau de bord" };

const ACTION_LABELS: Record<string, string> = { "organization.created": "Entreprise créée" };

export default async function DashboardPage() {
  const ctx = await getSessionContext();
  if (!ctx?.organization || !ctx.membership) redirect("/onboarding");
  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const canSeeFinance = ["owner", "admin"].includes(ctx.membership.role);

  const [members, departments, logs] = await Promise.all([
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "active"),
    supabase.from("departments").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("is_active", true),
    canSeeFinance
      ? supabase.from("activity_logs").select("id, action, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(8)
      : Promise.resolve({ data: [] as { id: number; action: string; created_at: string }[] }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bonjour, {ctx.fullName.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-slate-600">Espace de travail de {ctx.organization.name}.</p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <dt className="text-sm text-slate-500">Collaborateurs actifs</dt>
          <dd className="mt-1 text-3xl font-semibold">{members.count ?? 0}</dd>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <dt className="text-sm text-slate-500">Départements actifs</dt>
          <dd className="mt-1 text-3xl font-semibold">{departments.count ?? 0}</dd>
        </div>
      </dl>

      {canSeeFinance && (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-5">
          <h2 className="text-sm font-semibold">Indicateurs financiers</h2>
          <p className="mt-1 text-sm text-slate-600">Chiffre d'affaires, dépenses, factures impayées et devis en attente s'afficheront ici dès que la facturation sera en place (phase 3). Réservé aux propriétaires et administrateurs.</p>
        </section>
      )}

      {canSeeFinance && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Activité récente</h2>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {(logs.data ?? []).length === 0 && <li className="p-4 text-sm text-slate-500">Aucune activité enregistrée.</li>}
            {(logs.data ?? []).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <span>{ACTION_LABELS[l.action] ?? l.action}</span>
                <time className="text-slate-500" dateTime={l.created_at}>
                  {new Date(l.created_at).toLocaleString("fr-FR", { timeZone: ctx.organization!.timezone, dateStyle: "medium", timeStyle: "short" })}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
