import Link from "next/link";
import { requirePermission } from "@/lib/auth/guard";
import { PAYMENT_METHODS } from "@/lib/commercial/labels";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Paiements" };

export default async function PaymentsPage() {
  const ctx = await requirePermission("payments.view");
  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const cur = ctx.organization.currency;
  const [{ data: pays }, { data: invs }, { data: clients }] = await Promise.all([
    supabase.from("payments").select("id, invoice_id, amount, method, paid_at, reference, is_deposit").eq("organization_id", orgId).order("paid_at", { ascending: false }).limit(200),
    supabase.from("invoices").select("id, number, client_id").eq("organization_id", orgId),
    supabase.from("clients").select("id, name").eq("organization_id", orgId),
  ]);
  const inv = new Map((invs ?? []).map((i: any) => [i.id, i]));
  const cname = new Map((clients ?? []).map((c: any) => [c.id, c.name]));
  const total = (pays ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">Paiements</h1>
        <p className="mt-1 text-sm text-slate-600">Les paiements s'enregistrent depuis la facture concernée, ce qui garantit le rapprochement. {(pays ?? []).length} règlement(s) affiché(s) : {formatMoney(total, cur)}.</p></div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600"><tr><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Facture</th>
            <th className="px-4 py-3 font-medium">Client</th><th className="px-4 py-3 font-medium">Mode</th><th className="px-4 py-3 text-right font-medium">Montant</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(pays ?? []).length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-slate-500">Aucun paiement.</td></tr>}
            {(pays ?? []).map((p: any) => {
              const i: any = inv.get(p.invoice_id);
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3">{formatDate(p.paid_at)}</td>
                  <td className="px-4 py-3">{i ? <Link href={`/invoices/${i.id}`} className="font-medium text-brand hover:underline">{i.number}</Link> : "—"}</td>
                  <td className="px-4 py-3">{i ? cname.get(i.client_id) ?? "—" : "—"}</td>
                  <td className="px-4 py-3">{PAYMENT_METHODS[p.method]}{p.is_deposit && <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-xs text-brand">Acompte</span>}{p.reference && <span className="text-xs text-slate-500"> · {p.reference}</span>}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatMoney(p.amount, cur)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
