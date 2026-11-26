import Link from "next/link";
import { StatusBadge } from "@/components/commercial/status-badge";
import { Flash } from "@/components/ui/flash";
import { requirePermission } from "@/lib/auth/guard";
import { EXPENSE_STATUS } from "@/lib/commercial/labels";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { createExpenseAction, deleteExpenseAction, expenseStatusAction } from "./actions";

export const metadata = { title: "Dépenses" };
const field = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";
const CATEGORIES = ["Matériel", "Fournitures", "Sous-traitance", "Transport", "Salaires", "Loyer et charges", "Communication", "Autre"];

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ m?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("expenses.view");
  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const cur = ctx.organization.currency;
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : "";

  let q = supabase.from("expenses").select("id, category, description, amount, expense_date, department_id, responsible_membership_id, receipt_path, status, created_by")
    .eq("organization_id", orgId).order("expense_date", { ascending: false }).limit(300);
  if (month) {
    const [y, mo] = month.split("-").map(Number);
    q = q.gte("expense_date", `${month}-01`).lt("expense_date", mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`);
  }
  const [{ data: expenses }, { data: depts }, { data: members }] = await Promise.all([
    q,
    supabase.from("departments").select("id, name").eq("organization_id", orgId).order("name"),
    supabase.from("memberships").select("id, profiles(full_name, email)").eq("organization_id", orgId).eq("status", "active"),
  ]);
  const dname = new Map((depts ?? []).map((d: any) => [d.id, d.name]));
  const mname = new Map((members ?? []).map((m: any) => [m.id, m.profiles?.full_name || m.profiles?.email]));
  const paths = (expenses ?? []).map((e: any) => e.receipt_path).filter(Boolean) as string[];
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("expense-receipts").createSignedUrls(paths, 300);
    (data ?? []).forEach((s: any) => s.signedUrl && signed.set(s.path, s.signedUrl));
  }
  const byCat = new Map<string, number>();
  (expenses ?? []).filter((e: any) => e.status === "approved").forEach((e: any) => byCat.set(e.category, (byCat.get(e.category) ?? 0) + Number(e.amount)));
  const approvedTotal = [...byCat.values()].reduce((a, b) => a + b, 0);
  const p = ctx.permissions;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Flash ok={sp.ok} err={sp.err} />
      <h1 className="text-2xl font-semibold tracking-tight">Dépenses</h1>
      <form className="flex flex-wrap items-end gap-2"><div><label htmlFor="m" className="mb-1.5 block text-sm font-medium">Mois</label><input id="m" type="month" name="m" defaultValue={month} className={field} /></div>
        <button className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50">Filtrer</button>{month && <Link href="/expenses" className="px-2 py-2.5 text-sm text-brand hover:underline">Tout afficher</Link>}</form>

      {p.includes("expenses.create") && (
        <details className="rounded-xl border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold">Nouvelle dépense</summary>
          <form action={createExpenseAction} className="mt-4 grid gap-3 sm:grid-cols-3">
            <input name="category" list="cats" required placeholder="Catégorie" aria-label="Catégorie" maxLength={60} className={field} />
            <datalist id="cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
            <input name="amount" type="number" min="0" step="any" required placeholder="Montant" aria-label="Montant" className={field} />
            <input name="expense_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} aria-label="Date" className={field} />
            <select name="department" aria-label="Département" className={field}><option value="">Aucun département</option>{(depts ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            <select name="responsible" aria-label="Responsable" className={field}><option value="">Aucun responsable</option>{(members ?? []).map((m: any) => <option key={m.id} value={m.id}>{mname.get(m.id)}</option>)}</select>
            <input name="description" placeholder="Description" aria-label="Description" maxLength={500} className={field} />
            <div className="sm:col-span-3"><label htmlFor="receipt" className="mb-1.5 block text-sm font-medium">Justificatif (facultatif)</label>
              <input id="receipt" name="receipt" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-medium file:text-brand" /></div>
            <div className="sm:col-span-3"><button className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">Enregistrer la dépense</button></div>
          </form>
        </details>
      )}

      {byCat.size > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Rapport : dépenses validées par catégorie · {formatMoney(approvedTotal, cur)}</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => (
              <li key={c} className="flex justify-between gap-3"><span>{c}</span><span className="font-medium">{formatMoney(v, cur)} <span className="text-xs font-normal text-slate-500">({Math.round((v / approvedTotal) * 100)} %)</span></span></li>
            ))}
          </ul>
        </section>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600"><tr><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Dépense</th>
            <th className="px-4 py-3 font-medium">Département</th><th className="px-4 py-3 font-medium">Statut</th><th className="px-4 py-3 text-right font-medium">Montant</th><th className="px-4 py-3" /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(expenses ?? []).length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-slate-500">Aucune dépense.</td></tr>}
            {(expenses ?? []).map((e: any) => (
              <tr key={e.id}>
                <td className="px-4 py-3">{formatDate(e.expense_date)}</td>
                <td className="px-4 py-3"><span className="font-medium">{e.category}</span>{e.description && <span className="block text-xs text-slate-500">{e.description}</span>}
                  {e.responsible_membership_id && <span className="block text-xs text-slate-500">Responsable : {mname.get(e.responsible_membership_id) ?? "—"}</span>}
                  {e.receipt_path && signed.get(e.receipt_path) && <a href={signed.get(e.receipt_path)} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline">Justificatif</a>}</td>
                <td className="px-4 py-3">{e.department_id ? dname.get(e.department_id) ?? "—" : "—"}</td>
                <td className="px-4 py-3"><StatusBadge status={e.status} map={EXPENSE_STATUS} /></td>
                <td className="px-4 py-3 text-right font-medium">{formatMoney(e.amount, cur)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {e.status === "pending" && p.includes("expenses.approve") && (<>
                      <form action={expenseStatusAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="approved" /><button className="text-xs font-medium text-ok hover:underline">Valider</button></form>
                      <form action={expenseStatusAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="rejected" /><button className="text-xs font-medium text-warn hover:underline">Refuser</button></form></>)}
                    {e.status !== "approved" && p.includes("expenses.delete") && <form action={deleteExpenseAction}><input type="hidden" name="id" value={e.id} /><button className="text-xs font-medium text-danger hover:underline">Supprimer</button></form>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
