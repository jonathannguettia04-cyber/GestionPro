export function pdfResponse(bytes: Uint8Array, filename: string) {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${safe}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
export const forbidden = () => new Response("Accès non autorisé.", { status: 403 });
export const notFoundResponse = () => new Response("Document introuvable.", { status: 404 });
