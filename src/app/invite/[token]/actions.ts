"use server";

import { redirect } from "next/navigation";
import { setActiveOrganization } from "@/lib/auth/org-actions";
import { dbMessage } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/types/forms";

export async function acceptInvitationAction(token: string, _: FormState): Promise<FormState> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { error: "Invitation invalide, expirée ou déjà utilisée." };
  const supabase = await createClient();
  const { data: orgId, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error || typeof orgId !== "string") return { error: dbMessage(error ?? { message: "" }, "Impossible d'accepter l'invitation.") };
  await setActiveOrganization(orgId);
  redirect("/dashboard?ok=" + encodeURIComponent("Bienvenue ! Vous avez rejoint l'entreprise."));
}
