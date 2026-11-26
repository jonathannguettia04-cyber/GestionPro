"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Banknote, Building2, ChevronsLeft, ChevronsRight, FileText, LayoutDashboard, LogOut, Menu, Package, Receipt, ShieldCheck, UserRound, Users, Wallet, X } from "lucide-react";
import clsx from "clsx";
import { signOutAction } from "@/lib/auth/actions";
import { switchOrganizationAction } from "@/lib/auth/org-actions";
import { Logo } from "./logo";

const NAV = [
  { label: "Tableau de bord", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Départements", icon: Building2, href: "/departments", perm: "departments.view" },
  { label: "Collaborateurs", icon: Users, href: "/employees", perm: "employees.view" },
  { label: "Permissions", icon: ShieldCheck, href: "/settings/permissions", perm: "permissions.manage" },
  { label: "Clients", icon: UserRound, href: "/clients", perm: "clients.view" },
  { label: "Produits et services", icon: Package, href: "/products", perm: "catalog.view" },
  { label: "Devis", icon: FileText, href: "/quotes", perm: "quotes.view" },
  { label: "Factures", icon: Receipt, href: "/invoices", perm: "invoices.view" },
  { label: "Paiements", icon: Banknote, href: "/payments", perm: "payments.view" },
  { label: "Dépenses", icon: Wallet, href: "/expenses", perm: "expenses.view" },
];

type Props = {
  orgName: string; orgId: string; organizations: { id: string; name: string }[];
  userName: string; roleLabel: string; permissions: string[]; children: React.ReactNode;
};

export function Shell({ orgName, orgId, organizations, userName, roleLabel, permissions, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const nav = (
    <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Navigation principale">
      {NAV.filter((n) => !n.perm || permissions.includes(n.perm)).map(({ label, icon: Icon, href }) => {
        const cls = "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm";
        const text = <span className={clsx(collapsed && "lg:hidden")}>{label}</span>;
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link key={label} href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
            className={clsx(cls, active ? "bg-white/10 font-medium text-white" : "text-white/75 hover:bg-white/5 hover:text-white")}>
            <Icon size={18} className="shrink-0" />{text}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className={clsx("hidden flex-col bg-night transition-[width] lg:flex", collapsed ? "w-[72px]" : "w-64")}>
        <div className={clsx("flex h-16 items-center overflow-hidden px-5", collapsed && "justify-center px-0")}><Logo light /></div>
        {nav}
        <button onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Déployer le menu" : "Réduire le menu"}
          className="m-3 flex items-center justify-center rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white">
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-night">
            <div className="flex h-16 items-center justify-between px-5"><Logo light />
              <button onClick={() => setOpen(false)} aria-label="Fermer le menu" className="text-white/70"><X size={20} /></button></div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setOpen(true)} aria-label="Ouvrir le menu" className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"><Menu size={20} /></button>
            {organizations.length > 1 ? (
              <form action={switchOrganizationAction}>
                <select name="orgId" defaultValue={orgId} aria-label="Changer d'entreprise" onChange={(e) => e.currentTarget.form?.requestSubmit()}
                  className="max-w-[14rem] truncate rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold">
                  {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </form>
            ) : <span className="truncate text-sm font-semibold">{orgName}</span>}
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{userName}</p>
              <p className="text-xs text-slate-500">{roleLabel}</p>
            </div>
            <form action={signOutAction}>
              <button type="submit" aria-label="Se déconnecter" title="Se déconnecter" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><LogOut size={18} /></button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
