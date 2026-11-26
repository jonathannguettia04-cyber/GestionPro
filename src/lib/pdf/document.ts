import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { formatDate, formatMoney } from "@/lib/format";

export type PdfDoc = {
  kind: "quote" | "invoice";
  number: string;
  currency: string;
  org: { name: string; address?: string | null; phone?: string | null; email?: string | null };
  client: { name: string; address?: string | null; phone?: string | null; email?: string | null };
  issueDate?: string | null;
  secondDateLabel: string;
  secondDate?: string | null;
  items: { description: string; quantity: number; unit: string; unit_price: number; discount_rate: number; tax_rate: number; line_subtotal: number }[];
  totals: { subtotal: number; discount: number; tax: number; total: number; paid?: number };
  notes?: string | null;
};

const NIGHT = rgb(0.078, 0.169, 0.29);
const GREY = rgb(0.42, 0.45, 0.5);
const W = 595.28, H = 841.89, M = 44;

export async function buildDocumentPdf(d: PdfDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const clean = (s: string, f: PDFFont) => [...(s ?? "")].map((c) => { try { f.encodeText(c); return c; } catch { return "?"; } }).join("");
  const wrap = (s: string, f: PDFFont, size: number, max: number) => {
    const out: string[] = []; let line = "";
    for (const word of clean(s, f).replace(/\s+/g, " ").trim().split(" ")) {
      const t = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(t, size) <= max) line = t; else { if (line) out.push(line); line = word; }
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  };

  let page = pdf.addPage([W, H]);
  const text = (s: string, x: number, y: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const f = o.f ?? font, size = o.size ?? 9.5, t = clean(s, f);
    page.drawText(t, { x: o.right ? x - f.widthOfTextAtSize(t, size) : x, y, size, font: f, color: o.color ?? rgb(0.1, 0.12, 0.16) });
  };

  page.drawRectangle({ x: 0, y: H - 78, width: W, height: 78, color: NIGHT });
  text(d.org.name, M, H - 40, { size: 17, f: bold, color: rgb(1, 1, 1) });
  text([d.org.phone, d.org.email].filter(Boolean).join("  ·  "), M, H - 58, { size: 8.5, color: rgb(0.8, 0.85, 0.95) });
  text(d.kind === "quote" ? "DEVIS" : "FACTURE", W - M, H - 40, { size: 17, f: bold, color: rgb(1, 1, 1), right: true });
  text(d.number, W - M, H - 58, { size: 10, color: rgb(0.8, 0.85, 0.95), right: true });

  let y = H - 112;
  text("Client", M, y, { size: 8.5, color: GREY }); text("Dates", W - M - 170, y, { size: 8.5, color: GREY });
  text(d.client.name, M, y - 15, { f: bold, size: 11 });
  let cy = y - 30;
  for (const l of [d.client.address, d.client.phone, d.client.email].filter(Boolean) as string[]) for (const w of wrap(l, font, 9, 250)) { text(w, M, cy); cy -= 12; }
  text(`Émis le ${formatDate(d.issueDate)}`, W - M - 170, y - 15);
  text(`${d.secondDateLabel} ${formatDate(d.secondDate)}`, W - M - 170, y - 29);

  y = Math.min(cy, y - 45) - 24;
  const cols = { desc: M, qty: 345, price: 415, disc: 460, tax: 497, total: W - M };
  const header = () => {
    page.drawRectangle({ x: M - 6, y: y - 6, width: W - 2 * M + 12, height: 22, color: rgb(0.945, 0.957, 0.98) });
    text("Désignation", cols.desc, y, { f: bold, size: 8.5 }); text("Qté", cols.qty, y, { f: bold, size: 8.5, right: true });
    text("Prix unitaire", cols.price, y, { f: bold, size: 8.5, right: true }); text("Remise", cols.disc, y, { f: bold, size: 8.5, right: true });
    text("Taxe", cols.tax, y, { f: bold, size: 8.5, right: true }); text("Total HT", cols.total, y, { f: bold, size: 8.5, right: true });
    y -= 22;
  };
  header();
  const num = (n: number) => String(Number(n)).replace(".", ",");
  for (const it of d.items) {
    const lines = wrap(it.description, font, 9.5, 235);
    if (y - lines.length * 12 < 150) { page = pdf.addPage([W, H]); y = H - 60; header(); }
    lines.forEach((ln, i) => text(ln, cols.desc, y - i * 12));
    text(`${num(it.quantity)} ${it.unit}`.slice(0, 14), cols.qty, y, { right: true });
    text(formatMoney(it.unit_price, d.currency).replace(/ (FCFA|€)$/, ""), cols.price, y, { right: true });
    text(it.discount_rate ? `${num(it.discount_rate)} %` : "—", cols.disc, y, { right: true });
    text(it.tax_rate ? `${num(it.tax_rate)} %` : "—", cols.tax, y, { right: true });
    text(formatMoney(it.line_subtotal, d.currency).replace(/ (FCFA|€)$/, ""), cols.total, y, { right: true });
    y -= lines.length * 12 + 6;
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: W - M, y: y + 3 }, thickness: 0.4, color: rgb(0.88, 0.9, 0.93) });
  }

  if (y < 170) { page = pdf.addPage([W, H]); y = H - 60; }
  y -= 14;
  const row = (label: string, value: string, strong = false) => {
    text(label, 360, y, { f: strong ? bold : font, size: strong ? 11 : 9.5, color: strong ? NIGHT : undefined });
    text(value, W - M, y, { f: strong ? bold : font, size: strong ? 11 : 9.5, right: true, color: strong ? NIGHT : undefined }); y -= strong ? 20 : 15;
  };
  row("Sous-total HT", formatMoney(d.totals.subtotal, d.currency));
  if (d.totals.discount > 0) row("dont remises accordées", formatMoney(d.totals.discount, d.currency));
  row("Taxes", formatMoney(d.totals.tax, d.currency));
  row("Total TTC", formatMoney(d.totals.total, d.currency), true);
  if (d.totals.paid !== undefined) {
    row("Déjà réglé", formatMoney(d.totals.paid, d.currency));
    row("Reste à payer", formatMoney(d.totals.total - d.totals.paid, d.currency), true);
  }
  if (d.notes) {
    y -= 8; text("Notes", M, y, { size: 8.5, color: GREY }); y -= 13;
    for (const w of wrap(d.notes, font, 9, W - 2 * M)) { text(w, M, y); y -= 12; }
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(clean(`${d.org.name} · ${d.number} · page ${i + 1}/${pages.length}`, font), { x: M, y: 24, size: 8, font, color: GREY }));
  return pdf.save();
}
