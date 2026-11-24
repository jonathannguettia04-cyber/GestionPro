import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/ui/flash";
import { requirePermission } from "@/lib/auth/guard";
import { EDITABLE_ROLES, ROLE_LABELS, permissionLabel } from "@/lib/permissions/catalog";
import { createClient } from "@/lib/supabase/server";
import {
  grantDepartmentAccessAction, removeOverrideAction, revokeDepartmentAccessAction, setOverrideAction, updateMemberAction,
} from "../actions";

const field = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm";
const btn = "rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark";
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "permanente");

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requirePermission("employees.view");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const { data: m } = await supabase.from("memberships").select("id, role, status, profiles(full_name, email)").eq("id", id).eq("organization_id", orgId).maybeSingle();
  if (!m) notFound();
  const profile = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name: string; email: string } | null;

  const canManageMember = ctx.permissions.includes("employees.manage") && m.role !== "owner" && (m.role !== "admin" || ctx.membership.role === "owner");
  const canPerm = ctx.permissions.includes("permissions.manage") && m.role !== "owner";
  const isOwner = ctx.membership.role === "owner";

  const [{ data: overrides }, { data: grants }, { data: depts }, { data: perms }, { data: links }] = await Promise.all([
    canPerm ? supabase.from("member_permissions").select("id, permission_code, effect, expires_at").eq("membership_id", id).order("permission_code") : Promise.resolve({ data: [] as any[] }),
    canPerm ? supabase.from("department_access_grants").select("id, department_id, expires_at, revoked_at").eq("membership_id", id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as any[] }),
    supabase.from("departments").select("id, name").eq("organization_id", orgId).order("name"),
    canPerm ? supabase.from("permissions").select("code").order("code") : Promise.resolve({ data: [] as any[] }),
    supabase.from("department_members").select("department_id").eq("membership_id", id),
  ]);
  const deptName = new Map((depts ?? []).map((d: any) => [d.id, d.name]));
  const now = Date.now();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Flash ok={sp.ok} err={sp.err} />
      <Link href="/employees" className="text-sm text-brand hover:underline">← Collaborateurs</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{profile?.full_name || profile?.email}</h1>
        <p className="text-sm text-slate-600">{profile?.email} · {ROLE_LABELS[m.role]} · {m.status === "active" ? "Actif" : "Accès révoqué"}</p>
        <p className="mt-1 text-sm text-slate-600">Départements : {(links ?? []).map((l: any) => deptName.get(l.department_id)).filter(Boolean).join(", ") || "aucun"}</p>
      </div>

      {canManageMember && (
        <form action={updateMemberAction} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-3">
          <input type="hidden" name="id" value={m.id} />
          <div><label htmlFor="role" className="mb-1.5 block text-sm font-medium">Rôle</label>
            <select id="role" name="role" defaultValue={m.role} className={field}>
              {EDITABLE_ROLES.filter((r) => r !== "admin" || isOwner || m.role === "admin").map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select></div>
          <div><label htmlFor="status" className="mb-1.5 block text-sm font-medium">Accès</label>
            <select id="status" name="status" defaultValue={m.status} className={field}>
              <option value="active">Actif</option><option value="revoked">Révoqué</option>
            </select></div>
          <div className="flex items-end"><button className={btn}>Enregistrer</button></div>
        </form>
      )}

      {canPerm && (
        <>
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <h2 className="text-sm font-semibold">Autorisations individuelles</h2>
              <p className="mt-1 text-xs text-slate-500">Elles s'ajoutent aux permissions du rôle. « Refuser » l'emporte toujours. Vous ne pouvez accorder que ce que vous possédez vous-même.</p>
            </div>
            <ul className="divide-y divide-slate-100">
              {(overrides ?? []).length === 0 && <li className="py-2 text-sm text-slate-500">Aucune surcharge : les permissions du rôle s'appliquent.</li>}
              {(overrides ?? []).map((o: any) => {
                const expired = o.expires_at && new Date(o.expires_at).getTime() <= now;
                return (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span>
                      <span className={o.effect === "grant" ? "text-ok" : "text-danger"}>{o.effect === "grant" ? "Accordé" : "Refusé"}</span> · {permissionLabel(o.permission_code)}
                      <span className="text-xs text-slate-500"> · {expired ? "expirée" : `jusqu'au ${fmt(o.expires_at)}`}</span>
                    </span>
                    <form action={removeOverrideAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="override" value={o.id} />
                      <button className="text-xs font-medium text-danger hover:underline">Supprimer</button></form>
                  </li>
                );
              })}
            </ul>
            <form action={setOverrideAction} className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
              <input type="hidden" name="id" value={m.id} />
              <select name="code" aria-label="Permission" required className={`${field} sm:col-span-2`}>
                <option value="">Permission…</option>
                {(perms ?? []).map((p: any) => <option key={p.code} value={p.code}>{permissionLabel(p.code)}</option>)}
              </select>
              <select name="effect" aria-label="Effet" className={field}><option value="grant">Accorder</option><option value="deny">Refuser</option></select>
              <input type="date" name="expires" aria-label="Expire le (facultatif)" className={field} />
              <div className="sm:col-span-4"><button className={btn}>Enregistrer l'autorisation</button></div>
            </form>
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <h2 className="text-sm font-semibold">Accès transversaux à d'autres départements</h2>
              <p className="mt-1 text-xs text-slate-500">Par défaut, un collaborateur ne voit que ses propres départements.</p>
            </div>
            <ul className="divide-y divide-slate-100">
              {(grants ?? []).length === 0 && <li className="py-2 text-sm text-slate-500">Aucun accès transversal.</li>}
              {(grants ?? []).map((g: any) => {
                const state = g.revoked_at ? "révoqué" : g.expires_at && new Date(g.expires_at).getTime() <= now ? "expiré" : `jusqu'au ${fmt(g.expires_at)}`;
                return (
                  <li key={g.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span>{deptName.get(g.department_id) ?? "—"} <span className="text-xs text-slate-500">· {state}</span></span>
                    {state.startsWith("jusqu") && (
                      <form action={revokeDepartmentAccessAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="grant" value={g.id} />
                        <button className="text-xs font-medium text-danger hover:underline">Révoquer</button></form>
                    )}
                  </li>
                );
              })}
            </ul>
            <form action={grantDepartmentAccessAction} className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
              <input type="hidden" name="id" value={m.id} />
              <select name="department" aria-label="Département" required className={field}>
                <option value="">Département…</option>
                {(depts ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <input type="date" name="expires" aria-label="Expire le (facultatif)" className={field} />
              <button className={btn}>Accorder l'accès</button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
