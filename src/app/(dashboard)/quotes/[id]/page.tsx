import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/commercial/status-badge";
import { Flash } from "@/components/ui/flash";
import { requirePermission } from "@/lib/auth/guard";
import { QUOTE_STATUS } from "@/lib/commercial/labels";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { convertQuoteAction, quoteStatusAction } from "../actions";

const btn = "rounded-lg px-4 py-2 text-sm font-semibold";

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requirePermission("quotes.view");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const cur = ctx.organization.currency;
  const { data: q } = await supabase.from("quotes").select("*").eq("id", id).eq("organization_id", ctx.organization.id).maybeSingle();
  if (!q) notFound();
  const [{ data: items }, { data: client }, { data: inv }] = await Promise.all([
    supabase.from("quote_items").select("*").eq("quote_id", id).order("position"),
    supabase.from("clients").select("name, email, phone, address").eq("id", q.client_id).maybeSingle(),
    supabase.from("invoices").select("id, number, status").eq("quote_id", id).neq("status", "cancelled").maybeSingle(),
  ]);
  const p = ctx.permissions;
  const status = (s: string, label: string, cls: string) => (
    <form action={quoteStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={s} /><button className={`${btn} ${cls}`}>{label}</button></form>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Flash ok={sp.ok} err={sp.err} />
      <Link href="/quotes" className="text-sm text-brand hover:underline">← Devis</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">{q.number}</h1>
          <p className="mt-1 text-sm text-slate-600">{client?.name ?? "Client inaccessible"} · émis le {formatDate(q.issue_date)} · valable jusqu'au {formatDate(q.valid_until)}</p></div>
        <StatusBadge status={q.status} map={QUOTE_STATUS} />
      </div>

      <div className="flex flex-wrap gap-2">
        {q.status === "draft" && p.includes("quotes.edit") && <Link href={`/quotes/${id}/edit`} className={`${btn} bg-white ring-1 ring-slate-300 hover:bg-slate-50`}>Modifier</Link>}
        {q.status === "draft" && p.includes("quotes.edit") && status("sent", "Marquer comme envoyé", "bg-brand text-white hover:bg-brand-dark")}
        {q.status === "sent" && p.includes("quotes.approve") && status("accepted", "Accepté par le client", "bg-ok text-white")}
        {q.status === "sent" && p.includes("quotes.approve") && status("rejected", "Refusé", "bg-white text-danger ring-1 ring-danger/40")}
        {q.status === "sent" && p.includes("quotes.edit") && status("expired", "Marquer expiré", "bg-white ring-1 ring-slate-300")}
        {q.status === "accepted" && !inv && p.includes("invoices.create") && (
          <form action={convertQuoteAction}><input type="hidden" name="id" value={id} /><button className={`${btn} bg-brand text-white hover:bg-brand-dark`}>Convertir en facture</button></form>
        )}
        {inv && <Link href={`/invoices/${inv.id}`} className={`${btn} bg-brand-soft text-brand`}>Facture {inv.number ?? "(brouillon)"}</Link>}
        {p.includes("quotes.export") && <a href={`/quotes/${id}/pdf`} target="_blank" rel="noopener" className={`${btn} bg-white ring-1 ring-slate-300 hover:bg-slate-50`}>Télécharger le PDF</a>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600"><tr><th className="px-4 py-3 font-medium">Désignation</th><th className="px-4 py-3 text-right font-medium">Qté</th>
            <th className="px-4 py-3 text-right font-medium">Prix unitaire</th><th className="px-4 py-3 text-right font-medium">Remise</th><th className="px-4 py-3 text-right font-medium">Taxe</th><th className="px-4 py-3 text-right font-medium">Total HT</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(items ?? []).map((i: any) => (
              <tr key={i.id}><td className="px-4 py-3">{i.description}</td><td className="px-4 py-3 text-right">{Number(i.quantity)} {i.unit}</td>
                <td className="px-4 py-3 text-right">{formatMoney(i.unit_price, cur)}</td><td className="px-4 py-3 text-right">{Number(i.discount_rate) ? `${Number(i.discount_rate)} %` : "—"}</td>
                <td className="px-4 py-3 text-right">{Number(i.tax_rate) ? `${Number(i.tax_rate)} %` : "—"}</td><td className="px-4 py-3 text-right font-medium">{formatMoney(i.line_subtotal, cur)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between"><dt className="text-slate-500">Sous-total HT</dt><dd>{formatMoney(q.subtotal, cur)}</dd></div>
        {Number(q.discount_total) > 0 && <div className="flex justify-between"><dt className="text-slate-500">dont remises</dt><dd>{formatMoney(q.discount_total, cur)}</dd></div>}
        <div className="flex justify-between"><dt className="text-slate-500">Taxes</dt><dd>{formatMoney(q.tax_total, cur)}</dd></div>
        <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold"><dt>Total TTC</dt><dd>{formatMoney(q.total, cur)}</dd></div>
      </dl>
      {q.notes && <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">{q.notes}</p>}
    </div>
  );
}
