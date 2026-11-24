import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { getSessionContext } from "@/lib/auth/session";

export const metadata = { title: "Créer votre entreprise" };

export default async function OnboardingPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (ctx.membership) redirect("/dashboard");
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8"><Logo /></div>
      <h1 className="text-2xl font-semibold tracking-tight">Créons votre entreprise</h1>
      <p className="mb-6 mt-1 text-sm text-slate-600">Quatre étapes, modifiables ensuite.</p>
      <OnboardingWizard />
    </main>
  );
}
