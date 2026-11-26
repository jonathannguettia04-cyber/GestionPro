// Génère un PDF d'exemple (accents, long texte, pagination) : npx tsx tests/pdf-smoke.ts /tmp/sample.pdf
import { writeFileSync } from "node:fs";
import { buildDocumentPdf } from "../src/lib/pdf/document";

const items = Array.from({ length: 40 }, (_, i) => ({
  description: `Prestation n°${i + 1} — impression « grand format » bâche 3×2 m, œillets & finitions éco ’’`,
  quantity: 1.5 + i, unit: "pièce", unit_price: 12500.5 + i * 100, discount_rate: i % 3 ? 0 : 10, tax_rate: 18, line_subtotal: 18750 + i * 1000,
}));
const total = items.reduce((s, i) => s + i.line_subtotal, 0);
buildDocumentPdf({
  kind: "invoice", number: "FAC-2026-0001", currency: "XOF", issueDate: "2026-11-26", secondDateLabel: "Échéance le", secondDate: "2026-12-26",
  org: { name: "Imprimerie Éclat d'Abidjan", phone: "+225 07 00 00 00 00", email: "contact@eclat.ci" },
  client: { name: "Société Générale d'Équipement", address: "Cocody Riviera 3, Abidjan, Côte d'Ivoire", email: "achats@sge.ci" },
  items, totals: { subtotal: total, discount: 15000, tax: Math.round(total * 0.18), total: Math.round(total * 1.18), paid: 100000 }, notes: "Paiement à 30 jours. Merci de votre confiance.",
}).then((b) => { writeFileSync(process.argv[2] ?? "/tmp/sample.pdf", b); console.log("PDF ok", b.length, "octets"); });
