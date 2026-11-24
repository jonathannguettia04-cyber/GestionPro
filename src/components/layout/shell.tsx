"use client";

import { useState } from "react";
import { Building2, ChevronsLeft, ChevronsRight, FileText, LayoutDashboard, LogOut, Menu, Receipt, Users, Wallet, X } from "lucide-react";
import clsx from "clsx";
import { signOutAction } from "@/lib/auth/actions";
import { Logo } from "./logo";

const NAV = [
  { label: "Tableau de bord", icon: LayoutDashboard, active: true },
  { label: "Départements", icon: Building2, phase: 2 },
  { label: "Collaborateurs", icon: Users, phase: 2 },
  { label: "Devis", icon: FileText, phase: 3 },
  { label: "Factures", icon: Receipt, phase: 3 },
  { label: "Dépenses", icon: Wallet, phase: 3 },
];

export function Shell({ orgName, userName, roleLabel, children }: { orgName: string; userName: string; roleLabel: string; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Navigation principale">
      {NAV.map(({ label, icon: Icon, active, phase }) => (
        <div key={label} title={phase ? `Disponible en phase ${phase}` : undefined} aria-disabled={!active}
          className={clsx("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
            active ? "bg-white/10 font-medium text-white" : "cursor-not-allowed text-white/45")}>
          <Icon size={18} className="shrink-0" />
          <span className={clsx(collapsed && "lg:hidden")}>{label}</span>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className={clsx("hidden flex-col bg-night transition-[width] lg:flex", collapsed ? "w-[72px]" : "w-64")}>
        <div className={clsx("flex h-16 items-center px-5", collapsed && "justify-center px-0")}>
          {collapsed ? <Logo light /> : <Logo light />}
        </div>
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
            <span className="truncate text-sm font-semibold">{orgName}</span>
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
