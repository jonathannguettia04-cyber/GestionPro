"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction } from "@/lib/auth/actions";
import { Alert, Field, SubmitButton } from "@/components/ui/form";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(forgotPasswordAction, undefined);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Mot de passe oublié</h1>
      <p className="mb-6 mt-1 text-sm text-slate-600">Saisissez votre e-mail : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
      <form action={action} className="space-y-4" noValidate>
        {state?.success && <Alert kind="success">{state.success}</Alert>}
        {state?.error && <Alert kind="error">{state.error}</Alert>}
        <Field label="Adresse e-mail" name="email" type="email" autoComplete="email" required error={state?.fieldErrors?.email} />
        <SubmitButton>Envoyer le lien</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm"><Link href="/login" className="font-medium text-brand hover:underline">Retour à la connexion</Link></p>
    </>
  );
}
