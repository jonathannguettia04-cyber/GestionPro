"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "@/lib/auth/actions";
import { Alert, PasswordField, SubmitButton } from "@/components/ui/form";

export default function ResetPasswordPage() {
  const [state, action] = useActionState(resetPasswordAction, undefined);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Nouveau mot de passe</h1>
      <p className="mb-6 mt-1 text-sm text-slate-600">Choisissez un mot de passe d'au moins 10 caractères.</p>
      <form action={action} className="space-y-4" noValidate>
        {state?.error && <Alert kind="error">{state.error}</Alert>}
        <PasswordField label="Nouveau mot de passe" name="password" autoComplete="new-password" required error={state?.fieldErrors?.password} />
        <PasswordField label="Confirmer le mot de passe" name="confirmPassword" autoComplete="new-password" required error={state?.fieldErrors?.confirmPassword} />
        <SubmitButton>Enregistrer</SubmitButton>
      </form>
    </>
  );
}
