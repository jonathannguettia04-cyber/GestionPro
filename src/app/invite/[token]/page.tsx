import { redirect } from "next/navigation";
import { AcceptForm } from "./accept-form";
import { Logo } from "@/components/layout/logo";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <Logo />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rejoindre une entreprise</h1>
        <p className="mt-2 text-sm text-slate-600">Vous êtes connecté avec <strong>{user.email}</strong>. L'invitation ne fonctionne que si elle a été émise pour cette adresse.</p>
      </div>
      <AcceptForm token={token} />
    </main>
  );
}
