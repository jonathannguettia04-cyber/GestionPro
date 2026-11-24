"use client";

import Link from "next/link";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signInAction } from "@/lib/auth/actions";
import { Alert, Field, PasswordField, SubmitButton } from "@/components/ui/form";

function Form() {
  const next = useSearchParams().get("next") ?? "";
  const [state, action] = useActionState(signInAction, undefined);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
      <p className="mb-6 mt-1 text-sm text-slate-600">Accédez à l'espace de travail de votre entreprise.</p>
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        {state?.error && <Alert kind="error">{state.error}</Alert>}
        <Field label="Adresse e-mail" name="email" type="email" autoComplete="email" required error={state?.fieldErrors?.email} />
        <PasswordField label="Mot de passe" name="password" autoComplete="current-password" required error={state?.fieldErrors?.password} />
        <div className="text-right">
          <Link href="/forgot-password" className="text-sm font-medium text-brand hover:underline">Mot de passe oublié ?</Link>
        </div>
        <SubmitButton>Se connecter</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Pas encore de compte ? <Link href="/register" className="font-medium text-brand hover:underline">Créer un compte</Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <Form />
    </Suspense>
  );
}
