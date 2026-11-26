import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/commercial/status-badge";
import { Flash } from "@/components/ui/flash";
import { requirePermission } from "@/lib/auth/guard";
import { INVOICE_STATUS, PAYMENT_METHODS } from "@/lib/commercial/labels";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { invoiceActionForm, recordPaymentAction } from "../actions";

const btn = "rounded-lg px-4 py-2 text-sm font-semibold";
const field = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requirePermission("invoices.view");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const cur = ctx.organization.currency;
  const { data: inv } = await supabase.from("invoices").select("*").eq("id", id).eq("organization_id", ctx.organization.id).maybeSingle();
  if (!inv) notFound();
  const [{ data: items }, { data: client }, { data: payments }, { data: quote }] = await Promise.all([
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position"),
    supabase.from("clients").select("name").eq("id", inv.client_id).maybeSingle(),
    ctx.permissions.includes("payments.view") ? supabase.from("payments").select("id, amount, method, paid_at, reference, is_deposit").eq("invoice_id", id).order("paid_at") : Promise.resolve({ data: [] as any[] }),
    inv.quote_id ? supabase.from("quotes").select("id, number").eq("id", inv.quote_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const p = ctx.permissions;
  const balance = Number(inv.total) - Number(inv.amount_paid);
  const payable = ["issued", "partially_paid"].includes(inv.status);
  const op = (o: string, label: string, cls: string, confirm?: string) => (
    <form action={invoiceActionForm}><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value={o} /><button className={`${btn} ${cls}`} title={confirm}>{label}</button></form>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Flash ok={sp.ok} err={sp.err} />
      <Link href="/invoices" className="text-sm text-brand hover:underline">← Factures</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">{inv.number ?? "Facture brouillon"}</h1>
          <p className="mt-1 text-sm text-slate-600">{client?.name ?? "Client inaccessible"}{inv.issue_date && ` · émise le ${formatDate(inv.issue_date)} · échéance ${formatDate(inv.due_date)}`}
            {quote && <> · <Link href={`/quotes/${quote.id}`} className="text-brand hover:underline">devis {quote.number}</Link></>}</p></div>
        <StatusBadge status={inv.status} map={INVOICE_STATUS} />
      </div>

      <div className="flex flex-wrap gap-2">
        {inv.status === "draft" && p.includes("invoices.edit") && <Link href={`/invoices/${id}/edit`} className={`${btn} bg-white ring-1 ring-slate-300 hover:bg-slate-50`}>Modifier</Link>}
        {inv.status === "draft" && p.includes("invoices.approve") && op("issue", "Émettre la facture", "bg-brand text-white hover:bg-brand-dark", "Attribue le numéro définitif et verrouille la facture")}
        {["draft", "issued"].includes(inv.status) && Number(inv.amount_paid) === 0 && p.includes("invoices.approve") && op("cancel", "Annuler", "bg-white text-danger ring-1 ring-danger/40")}
        {inv.status !== "draft" && inv.status !== "cancelled" && p.includes("invoices.export") && <a href={`/invoices/${id}/pdf`} target="_blank" rel="noopener" className={`${btn} bg-white ring-1 ring-slate-300 hover:bg-slate-50`}>Télécharger le PDF</a>}
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
        <div className="flex justify-between"><dt className="text-slate-500">Sous-total HT</dt><dd>{formatMoney(inv.subtotal, cur)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Taxes</dt><dd>{formatMoney(inv.tax_total, cur)}</dd></div>
        <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold"><dt>Total TTC</dt><dd>{formatMoney(inv.total, cur)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Déjà réglé</dt><dd>{formatMoney(inv.amount_paid, cur)}</dd></div>
        <div className="flex justify-between font-semibold"><dt>Reste à payer</dt><dd>{formatMoney(inv.status === "cancelled" ? 0 : balance, cur)}</dd></div>
      </dl>

      {inv.status !== "draft" && p.includes("payments.view") && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Paiements</h2>
          <ul className="divide-y divide-slate-100">
            {(payments ?? []).length === 0 && <li className="py-2 text-sm text-slate-500">Aucun paiement enregistré.</li>}
            {(payments ?? []).map((x: any) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span>{formatDate(x.paid_at)} · {PAYMENT_METHODS[x.method]}{x.is_deposit && <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-xs text-brand">Acompte</span>}{x.reference && <span className="text-xs text-slate-500"> · {x.reference}</span>}</span>
                <span className="font-medium">{formatMoney(x.amount, cur)}</span>
              </li>
            ))}
          </ul>
          {payable && p.includes("payments.create") && (
            <form action={recordPaymentAction} className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
              <input type="hidden" name="id" value={id} />
              <input name="amount" type="number" min="0" step="any" required defaultValue={balance} aria-label="Montant" className={field} />
              <select name="method" aria-label="Mode de paiement" className={field}>{Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input name="paid_at" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} max={new Date().toISOString().slice(0, 10)} aria-label="Date" className={field} />
              <input name="reference" placeholder="Référence" maxLength={100} aria-label="Référence" className={field} />
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="is_deposit" className="accent-brand" />Acompte</label>
              <div className="sm:col-span-4"><button className={`${btn} bg-brand text-white hover:bg-brand-dark`}>Enregistrer le paiement</button></div>
            </form>
          )}
        </section>
      )}
      {inv.notes && <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">{inv.notes}</p>}
    </div>
  );
}
