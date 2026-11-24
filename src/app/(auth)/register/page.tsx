"use client";

import Link from "next/link";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signUpAction } from "@/lib/auth/actions";
import { Alert, Field, PasswordField, SubmitButton } from "@/components/ui/form";

function Form() {
  const next = useSearchParams().get("next") ?? "";
  const [state, action] = useActionState(signUpAction, undefined);

  if (state?.success) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Vérifiez votre boîte mail</h1>
        <div className="mt-4"><Alert kind="success">{state.success}</Alert></div>
        <p className="mt-6 text-sm text-slate-600">Après vérification, vous pourrez créer votre entreprise. <Link href="/login" className="font-medium text-brand hover:underline">Retour à la connexion</Link></p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Créer un compte</h1>
      <p className="mb-6 mt-1 text-sm text-slate-600">Vous créerez ensuite votre entreprise en quelques étapes.</p>
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        {state?.error && <Alert kind="error">{state.error}</Alert>}
        <Field label="Nom complet" name="fullName" autoComplete="name" required error={state?.fieldErrors?.fullName} />
        <Field label="Adresse e-mail" name="email" type="email" autoComplete="email" required error={state?.fieldErrors?.email} />
        <PasswordField label="Mot de passe" name="password" autoComplete="new-password" required hint="10 caractères minimum, avec lettres et chiffres." error={state?.fieldErrors?.password} />
        <PasswordField label="Confirmer le mot de passe" name="confirmPassword" autoComplete="new-password" required error={state?.fieldErrors?.confirmPassword} />
        <div>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="terms" className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand" />
            <span>J'accepte les conditions d'utilisation et la politique de confidentialité.</span>
          </label>
          {state?.fieldErrors?.terms && <p className="mt-1 text-xs text-danger">{state.fieldErrors.terms[0]}</p>}
        </div>
        <SubmitButton>Créer mon compte</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Déjà inscrit ? <Link href="/login" className="font-medium text-brand hover:underline">Se connecter</Link>
      </p>
    </>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <Form />
    </Suspense>
  );
}
