import { Shell } from "@/components/layout/shell";
import { requireContext } from "@/lib/auth/guard";
import { ROLE_LABELS } from "@/lib/permissions/catalog";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  return (
    <Shell orgName={ctx.organization.name} orgId={ctx.organization.id} organizations={ctx.organizations}
      userName={ctx.fullName} roleLabel={ROLE_LABELS[ctx.membership.role]} permissions={ctx.permissions}>
      {children}
    </Shell>
  );
}
