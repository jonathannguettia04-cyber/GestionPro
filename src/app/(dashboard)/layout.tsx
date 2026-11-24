import { redirect } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { getSessionContext } from "@/lib/auth/session";

const ROLE_LABELS = { owner: "Propriétaire", admin: "Administrateur", department_manager: "Responsable de département", member: "Collaborateur" } as const;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.membership || !ctx.organization) redirect("/onboarding");
  return (
    <Shell orgName={ctx.organization.name} userName={ctx.fullName} roleLabel={ROLE_LABELS[ctx.membership.role]}>
      {children}
    </Shell>
  );
}
