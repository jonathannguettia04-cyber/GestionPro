"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/redirect";
import { forgotSchema, loginSchema, registerSchema, resetSchema } from "@/lib/validations/auth";
import type { FormState } from "@/types/forms";

async function siteUrl() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_SITE_URL || h.get("origin") || "http://localhost:3000";
}

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou mot de passe incorrect.";
  if (m.includes("email not confirmed")) return "Adresse e-mail non vérifiée. Ouvrez le lien reçu par e-mail.";
  if (m.includes("rate limit") || m.includes("too many")) return "Trop de tentatives. Réessayez dans quelques minutes.";
  if (m.includes("same password")) return "Choisissez un mot de passe différent de l'ancien.";
  if (m.includes("password")) return "Mot de passe refusé : choisissez-en un plus robuste.";
  return "Une erreur est survenue. Réessayez.";
}

export async function signInAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: friendly(error.message) };
  redirect(safeNext(formData.get("next")));
}

export async function signUpAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(safeNext(formData.get("next"), "/onboarding"))}`,
    },
  });
  if (error) return { error: friendly(error.message) };
  // Réponse identique que l'e-mail existe déjà ou non (pas d'énumération de comptes).
  return { success: "Compte créé. Ouvrez le lien de vérification envoyé à votre adresse e-mail pour continuer." };
}

export async function forgotPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteUrl()}/auth/callback?next=/reset-password`,
  });
  return { success: "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé." };
}

export async function resetPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: friendly(error.message) };
  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
