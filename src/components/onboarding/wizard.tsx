"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { createOrganizationAction } from "@/app/onboarding/actions";
import { Alert, Field, Select, SubmitButton } from "@/components/ui/form";
import { CURRENCIES, INVITE_ROLES, SECTORS, TIMEZONES } from "@/lib/validations/organization";

const STEPS = ["Informations", "Configuration", "Organisation", "Confirmation"];
type Dept = { name: string; description: string; manager_is_me: boolean };
type Invite = { email: string; role: "admin" | "department_manager" | "member" };

export function OnboardingWizard() {
  const [state, action] = useActionState(createOrganizationAction, undefined);
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState("");
  const [f, setF] = useState({
    name: "", sector: "", phone: "", address: "", email: "",
    currency: "XOF", timezone: "Africa/Abidjan",
    quote_prefix: "DEV", invoice_prefix: "FAC", default_tax_rate: "18", payment_terms_days: "30",
  });
  const [departments, setDepartments] = useState<Dept[]>([{ name: "", description: "", manager_is_me: false }]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const payload = JSON.stringify({
    name: f.name, sector: f.sector, phone: f.phone, address: f.address, email: f.email,
    currency: f.currency, timezone: f.timezone,
    billing: { quote_prefix: f.quote_prefix, invoice_prefix: f.invoice_prefix, default_tax_rate: f.default_tax_rate, payment_terms_days: f.payment_terms_days },
    departments, invites,
  });

  function next() {
    setStepError("");
    if (step === 0) {
      if (f.name.trim().length < 2) return setStepError("Saisissez le nom de l'entreprise.");
      if (!f.sector) return setStepError("Choisissez un secteur d'activité.");
    }
    if (step === 1) {
      const t = Number(f.default_tax_rate);
      if (!(t >= 0 && t <= 100)) return setStepError("Le taux de taxe doit être compris entre 0 et 100.");
      if (!f.quote_prefix.trim() || !f.invoice_prefix.trim()) return setStepError("Les préfixes de numérotation sont obligatoires.");
    }
    setStep(step + 1);
  }

  const sectorLabel = SECTORS.find((s) => s.value === f.sector)?.label ?? "";
  const deptNames = departments.filter((d) => d.name.trim()).map((d) => d.name.trim());
  const inviteList = invites.filter((i) => i.email.trim());

  return (
    <form action={action} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <input type="hidden" name="payload" value={payload} />
      <ol className="mb-8 flex gap-2" aria-label="Progression">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <div className={clsx("h-1 rounded-full", i <= step ? "bg-brand" : "bg-slate-200")} />
            <span className={clsx("mt-2 block text-xs", i === step ? "font-semibold text-night" : "text-slate-500")}>{label}</span>
          </li>
        ))}
      </ol>

      {/* Les étapes restent montées (hidden) pour que le fichier logo soit toujours envoyé. */}
      <section hidden={step !== 0} className="space-y-4">
        <Field label="Nom de l'entreprise" name="name_visible" value={f.name} onChange={set("name")} required />
        <Select label="Secteur d'activité" name="sector_visible" value={f.sector} onChange={set("sector")}>
          <option value="">Choisir…</option>
          {SECTORS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Téléphone" name="phone_visible" type="tel" value={f.phone} onChange={set("phone")} />
          <Field label="E-mail professionnel" name="email_visible" type="email" value={f.email} onChange={set("email")} />
        </div>
        <Field label="Adresse" name="address_visible" value={f.address} onChange={set("address")} />
        <div>
          <label htmlFor="logo" className="mb-1.5 block text-sm font-medium">Logo (facultatif)</label>
          <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp"
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-medium file:text-brand" />
          <p className="mt-1 text-xs text-slate-500">PNG, JPEG ou WebP, 2 Mo maximum.</p>
        </div>
      </section>

      <section hidden={step !== 1} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Devise" name="currency_visible" value={f.currency} onChange={set("currency")}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Select label="Fuseau horaire" name="tz_visible" value={f.timezone} onChange={set("timezone")}>
            {TIMEZONES.map((t) => <option key={t}>{t}</option>)}
          </Select>
          <Field label="Préfixe des devis" name="qp" value={f.quote_prefix} onChange={set("quote_prefix")} maxLength={10} />
          <Field label="Préfixe des factures" name="ip" value={f.invoice_prefix} onChange={set("invoice_prefix")} maxLength={10} />
          <Field label="Taxe par défaut (%)" name="tax" type="number" min={0} max={100} step="0.01" value={f.default_tax_rate} onChange={set("default_tax_rate")} />
          <Field label="Délai de paiement (jours)" name="terms" type="number" min={0} max={365} value={f.payment_terms_days} onChange={set("payment_terms_days")} />
        </div>
        <p className="text-xs text-slate-500">Ces valeurs sont modifiables ensuite dans les paramètres.</p>
      </section>

      <section hidden={step !== 2} className="space-y-6">
        <div>
          <h2 className="text-sm font-semibold">Départements</h2>
          <p className="mb-3 text-xs text-slate-500">Créez ceux dont vous avez besoin, vous pourrez en ajouter d'autres plus tard.</p>
          <div className="space-y-3">
            {departments.map((d, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex-1 space-y-1.5">
                  <input aria-label={`Nom du département ${i + 1}`} placeholder="Nom (ex. Infographie)" value={d.name} maxLength={80}
                    onChange={(e) => setDepartments(departments.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={d.manager_is_me} className="accent-brand"
                      onChange={(e) => setDepartments(departments.map((x, j) => (j === i ? { ...x, manager_is_me: e.target.checked } : x)))} />
                    Je suis le responsable
                  </label>
                </div>
                <button type="button" aria-label="Supprimer ce département" onClick={() => setDepartments(departments.filter((_, j) => j !== i))}
                  className="mt-1 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-danger"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          {departments.length < 20 && (
            <button type="button" onClick={() => setDepartments([...departments, { name: "", description: "", manager_is_me: false }])}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"><Plus size={16} />Ajouter un département</button>
          )}
        </div>
        <div>
          <h2 className="text-sm font-semibold">Inviter des collaborateurs</h2>
          <p className="mb-3 text-xs text-slate-500">Les invitations sont enregistrées ; l'envoi par e-mail arrive avec la gestion des collaborateurs.</p>
          <div className="space-y-3">
            {invites.map((inv, i) => (
              <div key={i} className="flex items-center gap-2">
                <input aria-label={`E-mail invité ${i + 1}`} type="email" placeholder="collegue@entreprise.com" value={inv.email}
                  onChange={(e) => setInvites(invites.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
                <select aria-label="Rôle" value={inv.role}
                  onChange={(e) => setInvites(invites.map((x, j) => (j === i ? { ...x, role: e.target.value as Invite["role"] } : x)))}
                  className="rounded-lg border border-slate-300 px-2 py-2.5 text-sm">
                  {INVITE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button type="button" aria-label="Retirer cette invitation" onClick={() => setInvites(invites.filter((_, j) => j !== i))}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-danger"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          {invites.length < 20 && (
            <button type="button" onClick={() => setInvites([...invites, { email: "", role: "member" }])}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"><Plus size={16} />Ajouter une invitation</button>
          )}
        </div>
      </section>

      <section hidden={step !== 3}>
        <dl className="divide-y divide-slate-100 text-sm">
          {[
            ["Entreprise", f.name], ["Secteur", sectorLabel], ["Devise et fuseau", `${f.currency} · ${f.timezone}`],
            ["Numérotation", `${f.quote_prefix} / ${f.invoice_prefix}`], ["Taxe par défaut", `${f.default_tax_rate} %`],
            ["Départements", deptNames.join(", ") || "Aucun"], ["Invitations", inviteList.map((i) => i.email).join(", ") || "Aucune"],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
              <dt className="w-40 shrink-0 text-slate-500">{k}</dt><dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-6 space-y-3">
        {(stepError || state?.error) && <Alert kind="error">{stepError || state?.error}</Alert>}
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => { setStepError(""); setStep(step - 1); }} disabled={step === 0}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:invisible">Retour</button>
          {step < 3 ? (
            <button type="button" onClick={next} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">Continuer</button>
          ) : (
            <SubmitButton className="w-auto px-5">Créer l'entreprise</SubmitButton>
          )}
        </div>
      </div>
    </form>
  );
}
