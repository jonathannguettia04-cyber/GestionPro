# GestionPro

SaaS multi-entreprises de gestion (imprimerie, événementiel). Next.js 15 (App Router) · TypeScript · Tailwind · Supabase (Postgres, Auth, Storage, RLS).

## Démarrage
1. Créer un projet Supabase ; copier `.env.example` en `.env.local` et renseigner `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. Appliquer les migrations : `supabase link --project-ref <ref> && supabase db push` (ou coller `supabase/migrations/*.sql` dans le SQL Editor).
3. Supabase > Authentication > URL Configuration : Site URL = `NEXT_PUBLIC_SITE_URL`, Redirect URLs = `<site>/auth/callback`.
4. `npm install && npm run dev`.

## Tests
- `npm run typecheck`
- `DATABASE_URL=postgres://... npm run test:db` : applique les migrations sur une base **jetable** (avec stubs Supabase) et vérifie l'isolation inter-entreprises.

## Sécurité (Phase 1)
- Toute table métier porte `organization_id` ; RLS activée ; droits `anon` retirés.
- `is_org_member` / `has_org_role` (security definer, `search_path=''`) alimentent les politiques.
- FK composites `(id, organization_id)` : aucune association entre deux entreprises.
- Création d'entreprise = RPC atomique `create_organization` ; le client ne peut pas créer de rôle `owner`.
- Journal d'activité en écriture seule via fonctions serveur ; aucune clé `service_role` dans l'application.
- Logos : bucket privé `organization-assets`, chemins préfixés par `organization_id`.

## Phase 2 : organisation interne
- Migration `20261125000001_permissions.sql` : catalogue `permissions` (module.action), rôles par entreprise (`role_permissions`, copiés depuis des modèles), surcharges individuelles `grant`/`deny` avec expiration (`member_permissions`), accès transversaux (`department_access_grants`), historique (`permission_changes`).
- `has_permission()` : propriétaire = tout ; sinon surcharge non expirée (deny prioritaire) puis permissions du rôle.
- Visibilité par département : un collaborateur ne voit que ses départements et ses collègues, sauf permission ou accès transversal.
- Anti-escalade : on n'accorde que ce qu'on possède ; seul le propriétaire crée des administrateurs ; le rôle `owner` n'est jamais modifiable côté client.
- Invitations : `create_invitation()` (jeton généré en base, seul le hash est stocké) et `accept_invitation()` (e-mail vérifié et identique à l'invitation). **Pas d'envoi d'e-mail** : le lien est affiché une fois à l'administrateur.
- Pages : /departments, /employees, /employees/[id], /settings/permissions, /invite/[token]. Sélecteur d'entreprise si l'utilisateur en a plusieurs.

## Hors périmètre actuel
Données métier (clients, devis, factures...) : Phase 3 ; elles devront porter `department_id` et utiliser `can_access_department()`.
