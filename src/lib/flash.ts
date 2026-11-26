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
  if (m.includes("document_locked")) return "Ce document n'est plus modifiable.";
  if (m.includes("invalid_transition")) return "Ce changement de statut n'est pas possible.";
  if (m.includes("invalid_items")) return "Ajoutez au moins une ligne valide (désignation, quantité, prix).";
  if (m.includes("invalid_client")) return "Client invalide.";
  if (m.includes("quote_not_accepted")) return "Seul un devis accepté peut être converti en facture.";
  if (m.includes("already_converted")) return "Ce devis a déjà été converti en facture.";
  if (m.includes("empty_invoice")) return "Une facture à zéro ne peut pas être émise.";
  if (m.includes("has_payments")) return "Impossible d'annuler une facture qui a des paiements.";
  if (m.includes("invoice_not_payable")) return "Cette facture n'accepte pas de paiement dans son état actuel.";
  if (m.includes("overpayment")) return "Le montant dépasse le solde restant dû.";
  if (m.includes("invalid_amount")) return "Montant invalide.";
  if (m.includes("invalid_date")) return "La date de paiement ne peut pas être dans le futur.";
  if (m.includes("self_approval")) return "Vous ne pouvez pas valider votre propre dépense.";
  if (error.code === "23514") return "Valeurs invalides (quantité, prix, remise ou taxe).";
  if (error.code === "42501") return "Action non autorisée avec vos droits actuels.";
  if (error.code === "23505") return "Cet élément existe déjà.";
  if (error.code === "23503") return "Association invalide.";
  return fallback;
}
