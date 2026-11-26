export const QUOTE_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Brouillon", tone: "slate" }, sent: { label: "Envoyé", tone: "blue" }, accepted: { label: "Accepté", tone: "green" },
  rejected: { label: "Refusé", tone: "red" }, expired: { label: "Expiré", tone: "orange" },
};
export const INVOICE_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Brouillon", tone: "slate" }, issued: { label: "Émise", tone: "blue" }, partially_paid: { label: "Partiellement payée", tone: "orange" },
  paid: { label: "Payée", tone: "green" }, cancelled: { label: "Annulée", tone: "red" },
};
export const EXPENSE_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "En attente", tone: "orange" }, approved: { label: "Validée", tone: "green" }, rejected: { label: "Refusée", tone: "red" },
};
export const PAYMENT_METHODS: Record<string, string> = {
  cash: "Espèces", bank_transfer: "Virement", mobile_money: "Mobile money", cheque: "Chèque", card: "Carte", other: "Autre",
};
