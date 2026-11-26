import Link from "next/link";
import { StatusBadge } from "@/components/commercial/status-badge";
import { Flash } from "@/components/ui/flash";
import { requirePermission } from "@/lib/auth/guard";
import { QUOTE_STATUS } from "@/lib/commercial/labels";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Devis" };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("quotes.view");
  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const status = sp.status && QUOTE_STATUS[sp.status] ? sp.status : "";

  let q = supabase.from("quotes").select("id, number, client_id, status, issue_date, valid_until, total").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const [{ data: quotes }, { data: clients }] = await Promise.all([q, supabase.from("clients").select("id, name").eq("organization_id", orgId)]);
  const cname = new Map((clients ?? []).map((c: any) => [c.id, c.name]));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Flash ok={sp.ok} err={sp.err} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Devis</h1>
        {ctx.permissions.includes("quotes.create") && <Link href="/quotes/new" className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">Nouveau devis</Link>}
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Filtrer par statut">
        {[["", "Tous"], ...Object.entries(QUOTE_STATUS).map(([k, v]) => [k, v.label])].map(([k, l]) => (
          <Link key={k} href={k ? `/quotes?status=${k}` : "/quotes"} aria-current={k === status ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm ${k === status ? "bg-night text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{l}</Link>
        ))}
      </nav>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600"><tr>
            <th className="px-4 py-3 font-medium">Numéro</th><th className="px-4 py-3 font-medium">Client</th><th className="px-4 py-3 font-medium">Valable jusqu'au</th>
            <th className="px-4 py-3 font-medium">Statut</th><th className="px-4 py-3 text-right font-medium">Total</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(quotes ?? []).length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-slate-500">Aucun devis.</td></tr>}
            {(quotes ?? []).map((x: any) => (
              <tr key={x.id}>
                <td className="px-4 py-3"><Link href={`/quotes/${x.id}`} className="font-medium text-brand hover:underline">{x.number}</Link></td>
                <td className="px-4 py-3">{cname.get(x.client_id) ?? "—"}</td>
                <td className="px-4 py-3">{formatDate(x.valid_until)}</td>
                <td className="px-4 py-3"><StatusBadge status={x.status} map={QUOTE_STATUS} /></td>
                <td className="px-4 py-3 text-right font-medium">{formatMoney(x.total, ctx.organization.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
