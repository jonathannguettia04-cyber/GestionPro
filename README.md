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

## Hors périmètre Phase 1
CRUD départements, invitations par e-mail, permissions fines, restriction par département : Phase 2.
