export const currencyDecimals = (currency: string) => (currency === "XOF" || currency === "XAF" ? 0 : 2);
const symbol = (c: string) => (c === "XOF" || c === "XAF" ? "FCFA" : c === "EUR" ? "€" : c);

// Espaces classiques (pas d'espace fine insécable) : compatible PDF et copier-coller.
export function formatMoney(amount: number | string | null | undefined, currency = "XOF") {
  const d = currencyDecimals(currency);
  const n = Number(amount ?? 0);
  const s = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  return `${s.replace(/[\u202f\u00a0]/g, " ")} ${symbol(currency)}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
