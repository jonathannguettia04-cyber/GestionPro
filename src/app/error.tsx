"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-6">
      <h1 className="text-2xl font-semibold">Un problème est survenu</h1>
      <p className="text-slate-600">L'opération n'a pas abouti. Vos données n'ont pas été perdues.</p>
      <button onClick={reset} className="w-fit rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">Réessayer</button>
    </main>
  );
}
