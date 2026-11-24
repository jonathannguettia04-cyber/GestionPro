import Link from "next/link";
import { Flash } from "@/components/ui/flash";
import { requirePermission } from "@/lib/auth/guard";
import { ACTION_LABELS, EDITABLE_ROLES, MODULE_LABELS, ROLE_LABELS, describeChange } from "@/lib/permissions/catalog";
import { createClient } from "@/lib/supabase/server";
import { saveRolePermissionsAction } from "./actions";

export const metadata = { title: "Permissions" };
const ACTIONS = ["view", "create", "edit", "delete", "approve", "export", "assign", "manage"];

export default async function PermissionsPage({ searchParams }: { searchParams: Promise<{ role?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("permissions.manage");
  const role = (EDITABLE_ROLES as readonly string[]).includes(sp.role ?? "") ? sp.role! : "member";
  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const [{ data: perms }, { data: current }, { data: changes }, { data: members }] = await Promise.all([
    supabase.from("permissions").select("code, module, action").order("module"),
    supabase.from("role_permissions").select("permission_code").eq("organization_id", orgId).eq("role", role),
    supabase.from("permission_changes").select("id, actor_id, target_membership_id, source, op, detail, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(30),
    supabase.from("memberships").select("id, user_id, profiles(full_name, email)").eq("organization_id", orgId),
  ]);
  const have = new Set((current ?? []).map((r: any) => r.permission_code));
  const codes = new Set((perms ?? []).map((p: any) => p.code));
  const modules = [...new Set((perms ?? []).map((p: any) => p.module as string))];
  const mName = new Map((members ?? []).map((m: any) => [m.id, m.profiles?.full_name || m.profiles?.email || "Collaborateur"]));
  const uName = new Map((members ?? []).map((m: any) => [m.user_id, m.profiles?.full_name || m.profiles?.email || "Utilisateur"]));
  const nameOf = (id: string | null) => (id ? (mName.get(id) as string) ?? "Collaborateur" : "—");

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Flash ok={sp.ok} err={sp.err} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Permissions</h1>
        <p className="mt-1 text-sm text-slate-600">Définissez ce que chaque rôle peut faire. Le propriétaire conserve tous les droits. Vous ne pouvez accorder que les permissions que vous possédez.</p>
      </div>

      <nav className="flex gap-2" aria-label="Rôles">
        {EDITABLE_ROLES.map((r) => (
          <Link key={r} href={`/settings/permissions?role=${r}`} aria-current={r === role ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${r === role ? "bg-night text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{ROLE_LABELS[r]}</Link>
        ))}
      </nav>

      <form action={saveRolePermissionsAction} className="space-y-4">
        <input type="hidden" name="role" value={role} />
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr><th className="px-4 py-3 font-medium">Module</th>{ACTIONS.map((a) => <th key={a} className="px-2 py-3 text-center font-medium">{ACTION_LABELS[a]}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {modules.map((mod) => (
                <tr key={mod}>
                  <th scope="row" className="px-4 py-2.5 font-medium">{MODULE_LABELS[mod] ?? mod}</th>
                  {ACTIONS.map((a) => {
                    const code = `${mod}.${a}`;
                    return <td key={a} className="px-2 py-2.5 text-center">
                      {codes.has(code) ? <input type="checkbox" name="perm" value={code} defaultChecked={have.has(code)} aria-label={`${MODULE_LABELS[mod] ?? mod} : ${ACTION_LABELS[a]}`} className="h-4 w-4 accent-brand" /> : <span aria-hidden className="text-slate-300">·</span>}
                    </td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">Enregistrer les permissions de ce rôle</button>
      </form>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Historique des modifications</h2>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {(changes ?? []).length === 0 && <li className="p-4 text-sm text-slate-500">Aucune modification enregistrée.</li>}
          {(changes ?? []).map((c: any) => (
            <li key={c.id} className="flex flex-col gap-1 p-4 text-sm sm:flex-row sm:justify-between">
              <span>{describeChange(c, nameOf)}<span className="text-xs text-slate-500"> · par {(uName.get(c.actor_id) as string) ?? "système"}</span></span>
              <time className="shrink-0 text-xs text-slate-500" dateTime={c.created_at}>{new Date(c.created_at).toLocaleString("fr-FR", { timeZone: ctx.organization.timezone, dateStyle: "medium", timeStyle: "short" })}</time>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
