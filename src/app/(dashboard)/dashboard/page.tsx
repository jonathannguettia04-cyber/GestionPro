import Link from "next/link";
import { redirect } from "next/navigation";
import { Flash } from "@/components/ui/flash";
import { getSessionContext } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Tableau de bord" };

const ACTION_LABELS: Record<string, string> = {
  "organization.created": "Entreprise créée", "invitation.created": "Invitation créée", "invitation.accepted": "Invitation acceptée",
  "quote.created": "Devis créé", "quote.updated": "Devis modifié", "quote.sent": "Devis envoyé", "quote.accepted": "Devis accepté", "quote.rejected": "Devis refusé", "quote.expired": "Devis expiré",
  "invoice.created": "Facture créée", "invoice.updated": "Facture modifiée", "invoice.created_from_quote": "Facture créée depuis un devis", "invoice.issued": "Facture émise", "invoice.cancelled": "Facture annulée",
  "payment.recorded": "Paiement enregistré", "expense.approved": "Dépense validée", "expense.rejected": "Dépense refusée",
};

function range(p: string) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (p === "year") return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Année ${y}` };
  return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)), label: now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; p?: string }> }) {
  const sp = await searchParams;
  const ctx = await getSessionContext();
  if (!ctx?.organization || !ctx.membership) redirect("/onboarding");
  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const cur = ctx.organization.currency;
  const perms = ctx.permissions;
  const period = sp.p === "year" ? "year" : "month";
  const r = range(period);

  const [fin, members, departments, quotesSent, logs] = await Promise.all([
    perms.includes("finance.view") ? supabase.rpc("finance_summary", { p_org: orgId, p_from: r.from, p_to: r.to }) : Promise.resolve({ data: null }),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "active"),
    supabase.from("departments").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("is_active", true),
    perms.includes("quotes.view") ? supabase.from("quotes").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "sent") : Promise.resolve({ count: null }),
    perms.includes("permissions.manage")
      ? supabase.from("activity_logs").select("id, action, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(8)
      : Promise.resolve({ data: [] as { id: number; action: string; created_at: string }[] }),
  ]);
  const f = fin.data as null | { revenue_billed: number; collected: number; expenses_approved: number; estimated_profit: number; unpaid_total: number; unpaid_count: number; by_department: { department_id: string; name: string; revenue: number; expenses: number }[] };

  const card = (label: string, value: string, hint?: string) => (
    <div className="rounded-xl border border-slate-200 bg-white p-5"><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 text-2xl font-semibold">{value}</dd>{hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}</div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Flash ok={sp.ok} err={sp.err} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Bonjour, {ctx.fullName.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-slate-600">Espace de travail de {ctx.organization.name}.</p></div>
        {f && <nav className="flex gap-2" aria-label="Période">{[["month", "Ce mois"], ["year", "Cette année"]].map(([k, l]) => (
          <Link key={k} href={`/dashboard?p=${k}`} aria-current={k === period ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm ${k === period ? "bg-night text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{l}</Link>))}</nav>}
      </div>

      {f && (
        <section aria-label="Indicateurs financiers" className="space-y-3">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {card("Chiffre d'affaires facturé", formatMoney(f.revenue_billed, cur), r.label)}
            {card("Encaissements", formatMoney(f.collected, cur), r.label)}
            {card("Dépenses validées", formatMoney(f.expenses_approved, cur), r.label)}
            {card("Bénéfice estimé", formatMoney(f.estimated_profit, cur), "Facturé moins dépenses validées")}
            {card("Factures impayées", formatMoney(f.unpaid_total, cur), `${f.unpaid_count} facture(s) en cours`)}
            {card("Devis en attente", String(quotesSent.count ?? 0), "Envoyés, sans réponse")}
          </dl>
          {f.by_department.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <caption className="px-4 pt-4 text-left text-sm font-semibold">Par département · {r.label}</caption>
                <thead className="text-slate-500"><tr><th className="px-4 py-2 font-medium">Département</th><th className="px-4 py-2 text-right font-medium">Facturé</th><th className="px-4 py-2 text-right font-medium">Dépenses</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {f.by_department.map((d) => <tr key={d.department_id}><td className="px-4 py-2.5">{d.name}</td><td className="px-4 py-2.5 text-right">{formatMoney(d.revenue, cur)}</td><td className="px-4 py-2.5 text-right">{formatMoney(d.expenses, cur)}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <dl className="grid gap-4 sm:grid-cols-2">
        {card("Collaborateurs actifs", String(members.count ?? 0))}
        {card("Départements actifs", String(departments.count ?? 0))}
      </dl>
      {!f && perms.includes("quotes.view") && <dl className="grid gap-4 sm:grid-cols-2">{card("Devis en attente", String(quotesSent.count ?? 0), "Envoyés, sans réponse")}</dl>}

      {perms.includes("permissions.manage") && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Activité récente</h2>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {(logs.data ?? []).length === 0 && <li className="p-4 text-sm text-slate-500">Aucune activité enregistrée.</li>}
            {(logs.data ?? []).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <span>{ACTION_LABELS[l.action] ?? l.action}</span>
                <time className="text-slate-500" dateTime={l.created_at}>{new Date(l.created_at).toLocaleString("fr-FR", { timeZone: ctx.organization!.timezone, dateStyle: "medium", timeStyle: "short" })}</time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
