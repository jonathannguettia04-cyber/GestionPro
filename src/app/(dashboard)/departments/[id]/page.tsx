import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/ui/flash";
import { requirePermission } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { addDepartmentMemberAction, removeDepartmentMemberAction, updateDepartmentAction } from "../actions";

const field = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm";

export default async function DepartmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requirePermission("departments.view");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const { data: dept } = await supabase.from("departments").select("id, name, description, is_active, manager_membership_id").eq("id", id).eq("organization_id", orgId).maybeSingle();
  if (!dept) notFound();

  const [{ data: members }, { data: links }, { data: orgMembers }] = await Promise.all([
    supabase.from("memberships").select("id, role, profiles(full_name, email)").eq("organization_id", orgId).eq("status", "active"),
    supabase.from("department_members").select("membership_id").eq("department_id", id),
    supabase.from("memberships").select("id, profiles(full_name, email)").eq("organization_id", orgId).eq("status", "active"),
  ]);
  const nameOf = new Map((members ?? []).map((m: any) => [m.id, m.profiles?.full_name || m.profiles?.email || "—"]));
  const inDept = new Set((links ?? []).map((l: any) => l.membership_id));
  const candidates = (orgMembers ?? []).filter((m: any) => !inDept.has(m.id));
  const canEdit = ctx.permissions.includes("departments.edit");
  const canAssign = ctx.permissions.includes("departments.manage") || ctx.permissions.includes("departments.assign");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Flash ok={sp.ok} err={sp.err} />
      <Link href="/departments" className="text-sm text-brand hover:underline">← Départements</Link>
      <h1 className="text-2xl font-semibold tracking-tight">{dept.name}</h1>

      {canEdit && (
        <form action={updateDepartmentAction} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
          <input type="hidden" name="id" value={dept.id} />
          <div><label htmlFor="name" className="mb-1.5 block text-sm font-medium">Nom</label>
            <input id="name" name="name" defaultValue={dept.name} required minLength={2} maxLength={80} className={field} /></div>
          <div><label htmlFor="manager" className="mb-1.5 block text-sm font-medium">Responsable</label>
            <select id="manager" name="manager" defaultValue={dept.manager_membership_id ?? ""} className={field}>
              <option value="">Aucun</option>
              {(members ?? []).map((m: any) => <option key={m.id} value={m.id}>{nameOf.get(m.id)}</option>)}
            </select></div>
          <div className="sm:col-span-2"><label htmlFor="description" className="mb-1.5 block text-sm font-medium">Description</label>
            <textarea id="description" name="description" rows={2} defaultValue={dept.description ?? ""} maxLength={500} className={field} /></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="is_active" defaultChecked={dept.is_active} className="accent-brand" />Département actif</label>
          <div className="sm:col-span-2"><button className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">Enregistrer</button></div>
        </form>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold">Effectif ({inDept.size})</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {[...inDept].length === 0 && <li className="py-3 text-sm text-slate-500">Aucun collaborateur affecté.</li>}
          {[...inDept].map((mid) => (
            <li key={mid as string} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span>{nameOf.get(mid as string) ?? "Collaborateur"}{mid === dept.manager_membership_id && <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-xs text-brand">Responsable</span>}</span>
              {canAssign && (
                <form action={removeDepartmentMemberAction}>
                  <input type="hidden" name="id" value={dept.id} /><input type="hidden" name="membership" value={mid as string} />
                  <button className="text-xs font-medium text-danger hover:underline">Retirer</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {canAssign && candidates.length > 0 && (
          <form action={addDepartmentMemberAction} className="mt-4 flex gap-2">
            <input type="hidden" name="id" value={dept.id} />
            <select name="membership" aria-label="Collaborateur à affecter" className={field} required>
              <option value="">Affecter un collaborateur…</option>
              {candidates.map((m: any) => <option key={m.id} value={m.id}>{m.profiles?.full_name || m.profiles?.email}</option>)}
            </select>
            <button className="shrink-0 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">Affecter</button>
          </form>
        )}
      </section>
    </div>
  );
}
