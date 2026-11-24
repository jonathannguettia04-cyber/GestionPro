import { redirect } from "next/navigation";
import { getSessionContext } from "./session";

export async function requireContext() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.membership || !ctx.organization) redirect("/onboarding");
  return { ...ctx, membership: ctx.membership, organization: ctx.organization };
}

// Contrôle côté serveur (les politiques RLS restent la barrière réelle).
export async function requirePermission(code: string) {
  const ctx = await requireContext();
  if (!ctx.permissions.includes(code)) redirect(`/dashboard?err=${encodeURIComponent("Accès non autorisé.")}`);
  return ctx;
}
