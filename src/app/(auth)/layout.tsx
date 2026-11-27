import { Logo } from "@/components/layout/logo";

const flow = ["Devis", "Acompte", "Maquette validée", "Production", "Livraison", "Solde"];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between bg-night p-12 text-white lg:flex">
        <Logo light />
        <div className="max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">De la demande client au solde, chaque étape est tracée.</h2>
          <ol className="mt-10 space-y-0">
            {flow.map((step, i) => (
              <li key={step} className="relative flex items-center gap-4 pb-5 last:pb-0">
                {i < flow.length - 1 && <span aria-hidden className="absolute left-[7px] top-4 h-full w-px bg-white/25" />}
                <span aria-hidden className="relative h-[15px] w-[15px] rounded-full border-2 border-brand bg-night" />
                <span className="text-sm text-white/85">{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-sm text-white/60">Chaque entreprise travaille dans son espace isolé : équipes, clients et chiffres restent privés.</p>
      </aside>
      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo /></div>
          {children}
        </div>
      </main>
    </div>
  );
}
