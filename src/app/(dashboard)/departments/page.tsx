import Link from "next/link";
import { Flash } from "@/components/ui/flash";
import { requirePermission } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createDepartmentAction } from "./actions";

export const metadata = { title: "Départements" };

export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("departments.view");
  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const [{ data: depts }, { data: members }, { data: links }] = await Promise.all([
    supabase.from("departments").select("id, name, description, is_active, manager_membership_id").eq("organization_id", orgId).order("name"),
    supabase.from("memberships").select("id, profiles(full_name, email)").eq("organization_id", orgId).eq("status", "active"),
    supabase.from("department_members").select("department_id").eq("organization_id", orgId),
  ]);
  const nameOf = new Map((members ?? []).map((m: any) => [m.id, m.profiles?.full_name || m.profiles?.email || "—"]));
  const count = new Map<string, number>();
  (links ?? []).forEach((l: any) => count.set(l.department_id, (count.get(l.department_id) ?? 0) + 1));
  const canCreate = ctx.permissions.includes("departments.create");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Flash ok={sp.ok} err={sp.err} />
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Départements</h1>
          <p className="mt-1 text-sm text-slate-600">Vous voyez les départements auxquels vous appartenez ou dont l'accès vous a été accordé.</p>
        </div>
      </div>

      {canCreate && (
        <details className="rounded-xl border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold">Nouveau département</summary>
          <form action={createDepartmentAction} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="name" className="mb-1.5 block text-sm font-medium">Nom</label>
              <input id="name" name="name" required minLength={2} maxLength={80} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></div>
            <div><label htmlFor="manager" className="mb-1.5 block text-sm font-medium">Responsable (facultatif)</label>
              <select id="manager" name="manager" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
                <option value="">Aucun</option>
                {(members ?? []).map((m: any) => <option key={m.id} value={m.id}>{nameOf.get(m.id)}</option>)}
              </select></div>
            <div className="sm:col-span-2"><label htmlFor="description" className="mb-1.5 block text-sm font-medium">Description</label>
              <textarea id="description" name="description" rows={2} maxLength={500} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></div>
            <div className="sm:col-span-2"><button className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">Créer le département</button></div>
          </form>
        </details>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr><th className="px-4 py-3 font-medium">Département</th><th className="px-4 py-3 font-medium">Responsable</th><th className="px-4 py-3 font-medium">Effectif</th><th className="px-4 py-3 font-medium">Statut</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(depts ?? []).length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-slate-500">Aucun département visible. {canCreate ? "Créez le premier ci-dessus." : ""}</td></tr>}
            {(depts ?? []).map((d: any) => (
              <tr key={d.id}>
                <td className="px-4 py-3"><Link href={`/departments/${d.id}`} className="font-medium text-brand hover:underline">{d.name}</Link>
                  {d.description && <p className="text-xs text-slate-500">{d.description}</p>}</td>
                <td className="px-4 py-3">{d.manager_membership_id ? nameOf.get(d.manager_membership_id) ?? "—" : "—"}</td>
                <td className="px-4 py-3">{count.get(d.id) ?? 0}</td>
                <td className="px-4 py-3">{d.is_active ? <span className="text-ok">Actif</span> : <span className="text-slate-500">Désactivé</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
