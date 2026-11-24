import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "GestionPro", template: "%s · GestionPro" },
  description: "Gérez devis, factures, commandes et équipes de votre entreprise au même endroit.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#142B4A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-surface text-night antialiased">{children}</body>
    </html>
  );
}
