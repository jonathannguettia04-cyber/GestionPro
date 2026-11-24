import { redirect } from "next/navigation";

export function flashRedirect(path: string, kind: "ok" | "err", message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(message)}`);
}

export function dbMessage(error: { code?: string; message: string }, fallback = "L'opération a échoué.") {
  const m = error.message;
  if (m.includes("already_member")) return "Cette personne est déjà membre de l'entreprise.";
  if (m.includes("invalid_email")) return "Adresse e-mail invalide.";
  if (m.includes("invalid_department")) return "Département invalide.";
  if (m.includes("invalid_role")) return "Rôle invalide.";
  if (m.includes("invitation_email_mismatch")) return "Cette invitation est destinée à une autre adresse e-mail.";
  if (m.includes("invalid_invitation")) return "Invitation invalide, expirée ou déjà utilisée.";
  if (m.includes("email_not_verified")) return "Vérifiez d'abord votre adresse e-mail.";
  if (error.code === "42501") return "Action non autorisée avec vos droits actuels.";
  if (error.code === "23505") return "Cet élément existe déjà.";
  if (error.code === "23503") return "Association invalide.";
  return fallback;
}
