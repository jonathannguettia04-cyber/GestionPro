"use client";

import { useActionState } from "react";
import { inviteAction } from "@/app/(dashboard)/employees/actions";
import { Alert, SubmitButton } from "@/components/ui/form";

const field = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm";
type Opt = { value: string; label: string };

function LinkResult({ state }: { state: Awaited<ReturnType<typeof inviteAction>> }) {
  if (!state) return null;
  if (state.error) return <Alert kind="error">{state.error}</Alert>;
  return (
    <div className="space-y-2">
      <Alert kind="success">{state.success}</Alert>
      <input readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} aria-label="Lien d'invitation" className={`${field} font-mono text-xs`} />
      <p className="text-xs text-slate-500">Ce lien ne sera plus affiché. Il n'est valable que pour l'adresse e-mail invitée.</p>
    </div>
  );
}

export function InviteForm({ roles, departments }: { roles: Opt[]; departments: Opt[] }) {
  const [state, action] = useActionState(inviteAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-1"><label htmlFor="inv-email" className="mb-1.5 block text-sm font-medium">E-mail</label>
          <input id="inv-email" name="email" type="email" required className={field} placeholder="collegue@entreprise.com" /></div>
        <div><label htmlFor="inv-role" className="mb-1.5 block text-sm font-medium">Rôle</label>
          <select id="inv-role" name="role" defaultValue="member" className={field}>{roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
        <div><label htmlFor="inv-dept" className="mb-1.5 block text-sm font-medium">Département</label>
          <select id="inv-dept" name="department" className={field}><option value="">Aucun</option>{departments.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></div>
      </div>
      <LinkResult state={state} />
      <SubmitButton className="w-auto px-5">Générer le lien d'invitation</SubmitButton>
    </form>
  );
}

export function RegenerateButton({ email, role, department }: { email: string; role: string; department?: string | null }) {
  const [state, action] = useActionState(inviteAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="email" value={email} /><input type="hidden" name="role" value={role} />
      <input type="hidden" name="department" value={department ?? ""} />
      <SubmitButton className="w-auto bg-white px-3 py-1.5 text-xs text-brand ring-1 ring-brand/30 hover:bg-brand-soft">Nouveau lien</SubmitButton>
      <LinkResult state={state} />
    </form>
  );
}
