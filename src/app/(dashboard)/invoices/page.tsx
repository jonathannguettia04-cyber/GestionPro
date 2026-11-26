import Link from "next/link";
import { StatusBadge } from "@/components/commercial/status-badge";
import { Flash } from "@/components/ui/flash";
import { requirePermission } from "@/lib/auth/guard";
import { INVOICE_STATUS } from "@/lib/commercial/labels";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Factures" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("invoices.view");
  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const status = sp.status && INVOICE_STATUS[sp.status] ? sp.status : "";
  let q = supabase.from("invoices").select("id, number, client_id, status, due_date, total, amount_paid").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const [{ data: invoices }, { data: clients }] = await Promise.all([q, supabase.from("clients").select("id, name").eq("organization_id", orgId)]);
  const cname = new Map((clients ?? []).map((c: any) => [c.id, c.name]));
  const cur = ctx.organization.currency;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Flash ok={sp.ok} err={sp.err} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Factures</h1>
        {ctx.permissions.includes("invoices.create") && <Link href="/invoices/new" className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">Nouvelle facture</Link>}
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Filtrer par statut">
        {[["", "Toutes"], ...Object.entries(INVOICE_STATUS).map(([k, v]) => [k, v.label])].map(([k, l]) => (
          <Link key={k} href={k ? `/invoices?status=${k}` : "/invoices"} aria-current={k === status ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm ${k === status ? "bg-night text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{l}</Link>
        ))}
      </nav>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600"><tr>
            <th className="px-4 py-3 font-medium">Numéro</th><th className="px-4 py-3 font-medium">Client</th><th className="px-4 py-3 font-medium">Échéance</th><th className="px-4 py-3 font-medium">Statut</th>
            <th className="px-4 py-3 text-right font-medium">Total</th><th className="px-4 py-3 text-right font-medium">Reste dû</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(invoices ?? []).length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-slate-500">Aucune facture.</td></tr>}
            {(invoices ?? []).map((x: any) => (
              <tr key={x.id}>
                <td className="px-4 py-3"><Link href={`/invoices/${x.id}`} className="font-medium text-brand hover:underline">{x.number ?? "Brouillon"}</Link></td>
                <td className="px-4 py-3">{cname.get(x.client_id) ?? "—"}</td>
                <td className="px-4 py-3">{formatDate(x.due_date)}</td>
                <td className="px-4 py-3"><StatusBadge status={x.status} map={INVOICE_STATUS} /></td>
                <td className="px-4 py-3 text-right">{formatMoney(x.total, cur)}</td>
                <td className="px-4 py-3 text-right font-medium">{["issued", "partially_paid"].includes(x.status) ? formatMoney(Number(x.total) - Number(x.amount_paid), cur) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
