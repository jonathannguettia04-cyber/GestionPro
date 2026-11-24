import Link from "next/link";
import { InviteForm, RegenerateButton } from "@/components/employees/invite";
import { Flash } from "@/components/ui/flash";
import { requirePermission } from "@/lib/auth/guard";
import { EDITABLE_ROLES, ROLE_LABELS } from "@/lib/permissions/catalog";
import { createClient } from "@/lib/supabase/server";
import { revokeInvitationAction } from "./actions";

export const metadata = { title: "Collaborateurs" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("employees.view");
  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const canInvite = ctx.permissions.includes("employees.create");

  const [{ data: members }, { data: depts }, { data: links }, invites] = await Promise.all([
    supabase.from("memberships").select("id, role, status, profiles(full_name, email)").eq("organization_id", orgId).order("created_at"),
    supabase.from("departments").select("id, name").eq("organization_id", orgId).eq("is_active", true).order("name"),
    supabase.from("department_members").select("department_id, membership_id").eq("organization_id", orgId),
    canInvite
      ? supabase.from("invitations").select("id, email, role, department_id, expires_at").eq("organization_id", orgId).eq("status", "pending").order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const deptName = new Map((depts ?? []).map((d: any) => [d.id, d.name]));
  const byMember = new Map<string, string[]>();
  (links ?? []).forEach((l: any) => byMember.set(l.membership_id, [...(byMember.get(l.membership_id) ?? []), deptName.get(l.department_id) ?? "—"]));
  const isOwner = ctx.membership.role === "owner";
  const roleOptions = EDITABLE_ROLES.filter((r) => r !== "admin" || isOwner).map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Flash ok={sp.ok} err={sp.err} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Collaborateurs</h1>
        <p className="mt-1 text-sm text-slate-600">Les collaborateurs d'un département voient uniquement leurs collègues, sauf permission explicite.</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr><th className="px-4 py-3 font-medium">Nom</th><th className="px-4 py-3 font-medium">Rôle</th><th className="px-4 py-3 font-medium">Départements</th><th className="px-4 py-3 font-medium">Statut</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(members ?? []).map((m: any) => (
              <tr key={m.id}>
                <td className="px-4 py-3"><Link href={`/employees/${m.id}`} className="font-medium text-brand hover:underline">{m.profiles?.full_name || m.profiles?.email}</Link>
                  <p className="text-xs text-slate-500">{m.profiles?.email}</p></td>
                <td className="px-4 py-3">{ROLE_LABELS[m.role]}</td>
                <td className="px-4 py-3">{(byMember.get(m.id) ?? []).join(", ") || "—"}</td>
                <td className="px-4 py-3">{m.status === "active" ? <span className="text-ok">Actif</span> : <span className="text-danger">Révoqué</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canInvite && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-sm font-semibold">Inviter un collaborateur</h2>
            <p className="mt-1 text-xs text-slate-500">L'invitation est liée à l'adresse e-mail saisie : la personne doit se connecter avec cette adresse (vérifiée) pour l'accepter. L'envoi automatique d'e-mails n'est pas encore configuré : transmettez le lien vous-même.</p>
          </div>
          <InviteForm roles={roleOptions} departments={(depts ?? []).map((d: any) => ({ value: d.id, label: d.name }))} />
          {(invites.data ?? []).length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <h3 className="mb-2 text-sm font-semibold">Invitations en attente</h3>
              <ul className="divide-y divide-slate-100">
                {(invites.data ?? []).map((i: any) => (
                  <li key={i.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
                    <div><p className="font-medium">{i.email}</p>
                      <p className="text-xs text-slate-500">{ROLE_LABELS[i.role]}{i.department_id ? ` · ${deptName.get(i.department_id) ?? ""}` : ""} · expire le {new Date(i.expires_at).toLocaleDateString("fr-FR")}</p></div>
                    <div className="flex items-start gap-2">
                      <RegenerateButton email={i.email} role={i.role} department={i.department_id} />
                      <form action={revokeInvitationAction}><input type="hidden" name="id" value={i.id} />
                        <button className="rounded-lg px-3 py-1.5 text-xs font-medium text-danger hover:bg-red-50">Révoquer</button></form>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
