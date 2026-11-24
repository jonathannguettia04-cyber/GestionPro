-- Tests d'isolation inter-entreprises (Phase 1). Échoue (exception) à la moindre fuite.
-- Exécuté dans une transaction annulée à la fin.
begin;

-- Deux utilisateurs, deux entreprises (créées via la vraie RPC, comme l'application)
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@a.test', '{"full_name":"Alice"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@b.test',   '{"full_name":"Bob"}'),
  ('cccccccc-0000-0000-0000-000000000003', 'carl@a.test',  '{"full_name":"Carl"}');

create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

set local role authenticated;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
insert into ctx select 'orgA', public.create_organization(
  'Alpha Print', 'printing', null, null, null, 'Africa/Abidjan',
  '{"default_tax_rate":18}'::jsonb,
  '[{"name":"Infographie","manager_is_me":true},{"name":"Commercial"}]'::jsonb,
  '[{"email":"carl@a.test","role":"member"}]'::jsonb);

select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
insert into ctx select 'orgB', public.create_organization(
  'Beta Events', 'events', null, null, null, 'Africa/Abidjan',
  '{}'::jsonb, '[{"name":"Logistique"}]'::jsonb, '[]'::jsonb);

do $$
declare a uuid; b uuid; n int;
begin
  select v into a from ctx where k = 'orgA';
  select v into b from ctx where k = 'orgB';

  -- Bob (org B) : ne voit rien de A
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
  select count(*) into n from public.organizations where id = a;                       if n <> 0 then raise exception 'FUITE organizations'; end if;
  select count(*) into n from public.departments where organization_id = a;            if n <> 0 then raise exception 'FUITE departments'; end if;
  select count(*) into n from public.memberships where organization_id = a;           if n <> 0 then raise exception 'FUITE memberships'; end if;
  select count(*) into n from public.invitations where organization_id = a;           if n <> 0 then raise exception 'FUITE invitations'; end if;
  select count(*) into n from public.activity_logs where organization_id = a;         if n <> 0 then raise exception 'FUITE activity_logs'; end if;
  select count(*) into n from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'; if n <> 0 then raise exception 'FUITE profiles'; end if;
  select count(*) into n from public.organizations;                                    if n <> 1 then raise exception 'Bob doit voir exactement 1 entreprise (vu: %)', n; end if;

  -- Bob ne peut pas écrire dans A (insertion d'un département / auto-ajout membre)
  begin
    insert into public.departments (organization_id, name) values (a, 'Intrus');
    raise exception 'FAILLE : insertion cross-tenant departments acceptée';
  exception when insufficient_privilege or check_violation then null; end;
  begin
    insert into public.memberships (organization_id, user_id, role) values (a, 'bbbbbbbb-0000-0000-0000-000000000002', 'admin');
    raise exception 'FAILLE : auto-ajout membership acceptée';
  exception when insufficient_privilege or check_violation then null; end;
  update public.organizations set name = 'Piraté' where id = a;
  get diagnostics n = row_count;                                                       if n <> 0 then raise exception 'FAILLE : update cross-tenant organizations'; end if;

  -- Bob ne peut pas se promouvoir propriétaire ni créer d'owner
  begin
    insert into public.memberships (organization_id, user_id, role) values (b, 'aaaaaaaa-0000-0000-0000-000000000001', 'owner');
    raise exception 'FAILLE : création d''un owner côté client acceptée';
  exception when insufficient_privilege or check_violation or unique_violation then null; end;

  -- Bob ne peut pas forger un journal d'activité (écriture directe interdite) ni appeler log_activity sur A
  begin
    insert into public.activity_logs (organization_id, action) values (b, 'faux');
    raise exception 'FAILLE : insertion directe activity_logs acceptée';
  exception when insufficient_privilege then null; end;
  begin
    perform public.log_activity(a, 'faux');
    raise exception 'FAILLE : log_activity cross-tenant accepté';
  exception when insufficient_privilege then null; end;

  -- Contrainte composite : un département de B ne peut pas avoir un responsable de A
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  select count(*) into n from public.departments where organization_id = a;            if n <> 2 then raise exception 'Alice doit voir ses 2 départements (vu: %)', n; end if;
  select count(*) into n from public.activity_logs where organization_id = a;          if n <> 1 then raise exception 'Alice (owner) doit voir le journal (vu: %)', n; end if;
  select count(*) into n from public.invitations where organization_id = a;            if n <> 1 then raise exception 'Alice doit voir son invitation (vu: %)', n; end if;
end $$;

-- La FK composite bloque l'association cross-entreprise, même avec les droits d'écriture (rôle propriétaire de la table)
reset role;
do $$
declare a uuid; b uuid; m_a uuid; d_b uuid;
begin
  select v into a from ctx where k = 'orgA';
  select v into b from ctx where k = 'orgB';
  select id into m_a from public.memberships where organization_id = a and role = 'owner';
  select id into d_b from public.departments where organization_id = b limit 1;
  begin
    insert into public.department_members (department_id, membership_id, organization_id) values (d_b, m_a, b);
    raise exception 'FAILLE : FK composite n''a pas bloqué membership(A) dans département(B)';
  exception when foreign_key_violation then null; end;
  begin
    update public.departments set manager_membership_id = m_a where id = d_b;
    raise exception 'FAILLE : FK composite n''a pas bloqué un responsable d''une autre entreprise';
  exception when foreign_key_violation then null; end;
end $$;

-- Un utilisateur non authentifié (anon) n'a accès à rien
set local role anon;
do $$
begin
  begin perform 1 from public.organizations; raise exception 'FAILLE : anon lit organizations';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
select 'OK : isolation inter-entreprises vérifiée' as resultat;
