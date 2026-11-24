export const MODULE_LABELS: Record<string, string> = {
  dashboard: "Tableau de bord", finance: "Chiffres financiers", clients: "Clients", catalog: "Produits et services",
  quotes: "Devis", invoices: "Factures", payments: "Paiements", expenses: "Dépenses", tasks: "Tâches",
  departments: "Départements", employees: "Collaborateurs", settings: "Paramètres", permissions: "Permissions",
};
export const ACTION_LABELS: Record<string, string> = {
  view: "Voir", create: "Créer", edit: "Modifier", delete: "Supprimer", approve: "Valider", export: "Exporter", assign: "Affecter", manage: "Gérer",
};
export const ROLE_LABELS: Record<string, string> = {
  owner: "Propriétaire", admin: "Administrateur", department_manager: "Responsable de département", member: "Collaborateur",
};
export const EDITABLE_ROLES = ["admin", "department_manager", "member"] as const;

export function permissionLabel(code: string) {
  const [m, a] = code.split(".");
  return `${MODULE_LABELS[m] ?? m} · ${ACTION_LABELS[a] ?? a}`;
}

type Change = { source: string; op: string; target_membership_id: string | null; detail: { old?: Record<string, any> | null; new?: Record<string, any> | null } };

export function describeChange(c: Change, nameOf: (id: string | null) => string): string {
  const row = (c.detail?.new ?? c.detail?.old ?? {}) as Record<string, any>;
  const who = nameOf(c.target_membership_id);
  switch (c.source) {
    case "role_permissions":
      return `Rôle ${ROLE_LABELS[row.role] ?? row.role} : ${c.op === "DELETE" ? "retrait" : "ajout"} de « ${permissionLabel(row.permission_code)} »`;
    case "member_permissions": {
      const base = `${who} : « ${permissionLabel(row.permission_code)} »`;
      if (c.op === "DELETE") return `${base}, surcharge supprimée`;
      const until = row.expires_at ? ` jusqu'au ${new Date(row.expires_at).toLocaleDateString("fr-FR")}` : "";
      return `${base}, ${row.effect === "grant" ? "accordé" : "refusé"}${until}`;
    }
    case "department_access_grants":
      return `${who} : accès transversal ${row.revoked_at ? "révoqué" : c.op === "INSERT" ? "accordé" : "modifié"}`;
    case "memberships": {
      if (c.op === "INSERT") return `${who} : rejoint l'entreprise (${ROLE_LABELS[row.role] ?? row.role})`;
      const o = c.detail?.old ?? {};
      if (o.status !== row.status) return `${who} : accès ${row.status === "revoked" ? "révoqué" : "rétabli"}`;
      return `${who} : rôle ${ROLE_LABELS[o.role] ?? o.role} → ${ROLE_LABELS[row.role] ?? row.role}`;
    }
    default:
      return `${c.source} ${c.op}`;
  }
}
