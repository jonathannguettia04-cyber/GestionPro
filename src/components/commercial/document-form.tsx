"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert, SubmitButton } from "@/components/ui/form";
import { currencyDecimals, formatMoney } from "@/lib/format";
import type { FormState } from "@/types/forms";

type Line = { description: string; quantity: string; unit: string; unit_price: string; discount_rate: string; tax_rate: string; catalog_item_id?: string };
type Opt = { id: string; name: string };
type Catalog = { id: string; name: string; unit: string; unit_price: number; tax_rate: number };
type Props = {
  kind: "quote" | "invoice";
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  documentId?: string;
  clients: Opt[]; departments: Opt[]; catalog: Catalog[];
  currency: string; defaultTax: number;
  initial?: { client_id: string; department_id: string | null; valid_until?: string | null; notes: string | null; items: Line[] };
};

const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

export function DocumentForm({ kind, action, documentId, clients, departments, catalog, currency, defaultTax, initial }: Props) {
  const [state, formAction] = useActionState(action, undefined);
  const blank: Line = { description: "", quantity: "1", unit: "unité", unit_price: "0", discount_rate: "0", tax_rate: String(defaultTax) };
  const [lines, setLines] = useState<Line[]>(initial?.items.length ? initial.items : [blank]);
  const set = (i: number, k: keyof Line, v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  // Aperçu uniquement : le total officiel est recalculé par le serveur.
  const preview = useMemo(() => {
    const d = currencyDecimals(currency);
    const r = (n: number) => Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d;
    let sub = 0, tax = 0;
    for (const l of lines) {
      const ls = r(Number(l.quantity || 0) * Number(l.unit_price || 0) * (1 - Number(l.discount_rate || 0) / 100));
      sub += ls; tax += r((ls * Number(l.tax_rate || 0)) / 100);
    }
    return { sub, tax, total: sub + tax };
  }, [lines, currency]);

  const payload = JSON.stringify(lines.map((l) => ({
    description: l.description, quantity: Number(l.quantity), unit: l.unit, unit_price: Number(l.unit_price),
    discount_rate: Number(l.discount_rate || 0), tax_rate: Number(l.tax_rate || 0), catalog_item_id: l.catalog_item_id || null,
  })));

  return (
    <form action={formAction} className="space-y-6">
      {documentId && <input type="hidden" name="id" value={documentId} />}
      <input type="hidden" name="items" value={payload} />
      {state?.error && <Alert kind="error">{state.error}</Alert>}

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-3">
        <div><label htmlFor="client" className="mb-1.5 block text-sm font-medium">Client</label>
          <select id="client" name="client" required defaultValue={initial?.client_id ?? ""} className={field}>
            <option value="">Choisir…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label htmlFor="department" className="mb-1.5 block text-sm font-medium">Département</label>
          <select id="department" name="department" defaultValue={initial?.department_id ?? ""} className={field}>
            <option value="">Aucun</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
        {kind === "quote" && (
          <div><label htmlFor="valid_until" className="mb-1.5 block text-sm font-medium">Valable jusqu'au</label>
            <input id="valid_until" type="date" name="valid_until" defaultValue={initial?.valid_until ?? ""} className={field} /></div>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Lignes</h2>
          {catalog.length > 0 && (
            <select aria-label="Ajouter depuis le catalogue" value="" className={`${field} max-w-xs`}
              onChange={(e) => {
                const c = catalog.find((x) => x.id === e.target.value);
                if (c) setLines([...lines.filter((l) => l.description || Number(l.unit_price) > 0), { description: c.name, quantity: "1", unit: c.unit, unit_price: String(c.unit_price), discount_rate: "0", tax_rate: String(c.tax_rate), catalog_item_id: c.id }]);
              }}>
              <option value="">Ajouter depuis le catalogue…</option>{catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="text-left text-xs text-slate-500"><tr>
              <th className="pb-2 font-medium">Désignation</th><th className="pb-2 pl-2 font-medium">Qté</th><th className="pb-2 pl-2 font-medium">Unité</th>
              <th className="pb-2 pl-2 font-medium">Prix unitaire</th><th className="pb-2 pl-2 font-medium">Remise %</th><th className="pb-2 pl-2 font-medium">Taxe %</th><th /></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-1"><input aria-label={`Désignation ligne ${i + 1}`} value={l.description} onChange={(e) => set(i, "description", e.target.value)} maxLength={300} className={field} /></td>
                  <td className="py-1 pl-2"><input aria-label="Quantité" type="number" min="0.001" step="any" value={l.quantity} onChange={(e) => set(i, "quantity", e.target.value)} className={`${field} w-20`} /></td>
                  <td className="py-1 pl-2"><input aria-label="Unité" value={l.unit} onChange={(e) => set(i, "unit", e.target.value)} maxLength={20} className={`${field} w-24`} /></td>
                  <td className="py-1 pl-2"><input aria-label="Prix unitaire" type="number" min="0" step="any" value={l.unit_price} onChange={(e) => set(i, "unit_price", e.target.value)} className={`${field} w-28`} /></td>
                  <td className="py-1 pl-2"><input aria-label="Remise" type="number" min="0" max="100" step="any" value={l.discount_rate} onChange={(e) => set(i, "discount_rate", e.target.value)} className={`${field} w-20`} /></td>
                  <td className="py-1 pl-2"><input aria-label="Taxe" type="number" min="0" max="100" step="any" value={l.tax_rate} onChange={(e) => set(i, "tax_rate", e.target.value)} className={`${field} w-20`} /></td>
                  <td className="py-1 pl-1"><button type="button" aria-label="Supprimer la ligne" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-danger disabled:opacity-30"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lines.length < 100 && <button type="button" onClick={() => setLines([...lines, blank])} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"><Plus size={16} />Ajouter une ligne</button>}
        <dl className="ml-auto max-w-xs space-y-1 border-t border-slate-100 pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Sous-total</dt><dd>{formatMoney(preview.sub, currency)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Taxes</dt><dd>{formatMoney(preview.tax, currency)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Total</dt><dd>{formatMoney(preview.total, currency)}</dd></div>
          <p className="pt-1 text-xs text-slate-500">Aperçu : le montant officiel est recalculé par le serveur à l'enregistrement.</p>
        </dl>
      </div>

      <div><label htmlFor="notes" className="mb-1.5 block text-sm font-medium">Notes</label>
        <textarea id="notes" name="notes" rows={2} maxLength={1000} defaultValue={initial?.notes ?? ""} className={field} /></div>
      <SubmitButton className="w-auto px-6">Enregistrer le brouillon</SubmitButton>
    </form>
  );
}
