import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-6">
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <p className="text-slate-600">Cette adresse n'existe pas ou a été déplacée.</p>
      <Link href="/dashboard" className="font-medium text-brand hover:underline">Retour au tableau de bord</Link>
    </main>
  );
}
