-- Tests Phase 2 : permissions fines, visibilité par département, invitations, anti-escalade.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('0a000000-0000-0000-0000-000000000001', 'owner@x.test', '{"full_name":"Owner"}'),
  ('0a000000-0000-0000-0000-000000000002', 'dana@x.test',  '{"full_name":"Dana"}'),
  ('0a000000-0000-0000-0000-000000000003', 'eve@x.test',   '{"full_name":"Eve"}'),
  ('0a000000-0000-0000-0000-000000000004', 'fay@x.test',   '{"full_name":"Fay"}'),
  ('0a000000-0000-0000-0000-000000000005', 'gus@x.test',   '{"full_name":"Gus"}'),
  ('0a000000-0000-0000-0000-000000000006', 'hal@y.test',   '{"full_name":"Hal"}');

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;
create schema test_h;
create function test_h.as_user(n int) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', ('0a000000-0000-0000-0000-00000000000' || n)::text, true) $$;
grant usage on schema test_h to authenticated;
grant execute on function test_h.as_user(int) to authenticated;

set local role authenticated;

-- Mise en place : org X (Owner) avec 2 départements ; org Y (Hal)
select test_h.as_user(1);
insert into ctx select 'orgX', public.create_organization('Entreprise X', 'printing', null, null, null, 'Africa/Abidjan',
  '{}'::jsonb, '[{"name":"Infographie"},{"name":"Commercial"}]'::jsonb, '[]'::jsonb)::text;
select test_h.as_user(6);
insert into ctx select 'orgY', public.create_organization('Entreprise Y', 'events', null, null, null, 'Africa/Abidjan',
  '{}'::jsonb, '[{"name":"Logistique"}]'::jsonb, '[]'::jsonb)::text;

-- Invitations par le propriétaire, puis acceptation par chaque invité
select test_h.as_user(1);
insert into ctx select 'tok_dana', public.create_invitation(v::uuid, 'dana@x.test', 'member',
  (select id from public.departments where organization_id = v::uuid and name = 'Infographie')) from ctx where k = 'orgX';
insert into ctx select 'tok_eve', public.create_invitation(v::uuid, 'eve@x.test', 'member',
  (select id from public.departments where organization_id = v::uuid and name = 'Commercial')) from ctx where k = 'orgX';
insert into ctx select 'tok_fay', public.create_invitation(v::uuid, 'fay@x.test', 'department_manager',
  (select id from public.departments where organization_id = v::uuid and name = 'Infographie')) from ctx where k = 'orgX';
insert into ctx select 'tok_gus', public.create_invitation(v::uuid, 'gus@x.test', 'admin') from ctx where k = 'orgX';

select test_h.as_user(2); select public.accept_invitation(v) from ctx where k = 'tok_dana';
select test_h.as_user(3); select public.accept_invitation(v) from ctx where k = 'tok_eve';
select test_h.as_user(4); select public.accept_invitation(v) from ctx where k = 'tok_fay';
select test_h.as_user(5); select public.accept_invitation(v) from ctx where k = 'tok_gus';

do $$
declare x uuid; y uuid; n int; d_info uuid; d_com uuid; m_dana uuid; m_eve uuid; m_fay uuid; m_owner uuid; m_gus uuid; tok text;
begin
  select v::uuid into x from ctx where k = 'orgX';
  select v::uuid into y from ctx where k = 'orgY';
  select id into d_info from public.departments where organization_id = x and name = 'Infographie';
  select id into d_com  from public.departments where organization_id = x and name = 'Commercial';

  -- 1. Visibilité limitée par département
  perform test_h.as_user(2);
  select count(*) into n from public.departments where organization_id = x;
  if n <> 1 then raise exception 'Dana doit voir 1 département (vu %)', n; end if;
  select count(*) into n from public.memberships where organization_id = x;
  if n <> 2 then raise exception 'Dana doit voir 2 membres : elle + Fay (vu %)', n; end if;
  perform test_h.as_user(3);
  select count(*) into n from public.departments where organization_id = x and id = d_info;
  if n <> 0 then raise exception 'FUITE : Eve voit Infographie'; end if;
  select count(*) into n from public.memberships where organization_id = x;
  if n <> 1 then raise exception 'Eve doit voir 1 membre (vu %)', n; end if;

  -- 2. Permissions de rôle
  perform test_h.as_user(2);
  if not public.has_permission(x, 'clients.view') then raise exception 'Dana doit avoir clients.view'; end if;
  if public.has_permission(x, 'invoices.view') then raise exception 'Dana ne doit pas avoir invoices.view'; end if;
  if public.has_permission(x, 'finance.view') then raise exception 'Dana ne doit pas voir la finance'; end if;
  begin insert into public.departments (organization_id, name) values (x, 'Pirate'); raise exception 'FAILLE : Dana crée un département';
  exception when insufficient_privilege then null; end;
  begin perform public.create_invitation(x, 'z@x.test', 'member'); raise exception 'FAILLE : Dana invite';
  exception when insufficient_privilege then null; end;

  -- 3. Surcharges individuelles (grant / deny / expiration)
  perform test_h.as_user(5);   -- Gus, administrateur
  select id into m_dana from public.memberships where organization_id = x and user_id = '0a000000-0000-0000-0000-000000000002';
  insert into public.member_permissions (organization_id, membership_id, permission_code, effect) values (x, m_dana, 'invoices.view', 'grant');
  perform test_h.as_user(2);
  if not public.has_permission(x, 'invoices.view') then raise exception 'Le grant individuel doit s''appliquer'; end if;
  perform test_h.as_user(5);
  insert into public.member_permissions (organization_id, membership_id, permission_code, effect) values (x, m_dana, 'clients.view', 'deny');
  perform test_h.as_user(2);
  if public.has_permission(x, 'clients.view') then raise exception 'Le deny individuel doit l''emporter sur le rôle'; end if;
  perform test_h.as_user(5);
  update public.member_permissions set expires_at = now() - interval '1 hour' where membership_id = m_dana and permission_code = 'clients.view';
  perform test_h.as_user(2);
  if not public.has_permission(x, 'clients.view') then raise exception 'Un deny expiré doit être ignoré'; end if;

  -- 4. Anti-escalade : Fay reçoit permissions.manage mais ne peut pas accorder ce qu'elle n'a pas
  perform test_h.as_user(1);
  select id into m_fay from public.memberships where organization_id = x and user_id = '0a000000-0000-0000-0000-000000000004';
  insert into public.member_permissions (organization_id, membership_id, permission_code, effect) values (x, m_fay, 'permissions.manage', 'grant');
  perform test_h.as_user(4);
  begin
    insert into public.member_permissions (organization_id, membership_id, permission_code, effect) values (x, m_dana, 'finance.view', 'grant');
    raise exception 'FAILLE : escalade de privilèges (Fay accorde finance.view sans l''avoir)';
  exception when insufficient_privilege then null; end;
  perform test_h.as_user(1);
  select id into m_owner from public.memberships where organization_id = x and role = 'owner';
  perform test_h.as_user(4);
  begin
    insert into public.member_permissions (organization_id, membership_id, permission_code, effect) values (x, m_owner, 'clients.view', 'deny');
    raise exception 'FAILLE : Fay restreint le propriétaire';
  exception when insufficient_privilege then null; end;

  -- 5. Rôles : l'admin ne peut ni créer d'admin ni toucher au propriétaire
  perform test_h.as_user(5);
  begin update public.memberships set role = 'admin' where id = m_dana; raise exception 'FAILLE : Gus promeut un admin';
  exception when insufficient_privilege then null; end;
  begin update public.memberships set role = 'owner' where id = m_dana; raise exception 'FAILLE : Gus crée un owner';
  exception when insufficient_privilege or unique_violation then null; end;
  update public.memberships set role = 'owner' where id = m_owner;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILLE : Gus modifie le propriétaire'; end if;
  update public.memberships set role = 'department_manager' where id = m_dana;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Gus doit pouvoir passer Dana responsable de département'; end if;
  update public.memberships set role = 'member' where id = m_dana;

  -- 6. Responsable désigné => membre du département automatiquement
  perform test_h.as_user(1);
  select id into m_eve from public.memberships where organization_id = x and user_id = '0a000000-0000-0000-0000-000000000003';
  update public.departments set manager_membership_id = m_eve where id = d_info;
  select count(*) into n from public.department_members where department_id = d_info and membership_id = m_eve;
  if n <> 1 then raise exception 'Le responsable doit être ajouté aux membres du département'; end if;
  perform test_h.as_user(3);
  select count(*) into n from public.departments where organization_id = x;
  if n <> 2 then raise exception 'Eve doit désormais voir 2 départements (vu %)', n; end if;
  perform test_h.as_user(1);
  delete from public.department_members where department_id = d_info and membership_id = m_eve;
  update public.departments set manager_membership_id = null where id = d_info;

  -- 7. Accès transversal explicite, temporaire puis révoqué
  perform test_h.as_user(1);
  insert into public.department_access_grants (organization_id, membership_id, department_id) values (x, m_dana, d_com);
  perform test_h.as_user(2);
  select count(*) into n from public.departments where organization_id = x;
  if n <> 2 then raise exception 'Dana doit voir 2 départements avec l''accès transversal (vu %)', n; end if;
  perform test_h.as_user(1);
  update public.department_access_grants set revoked_at = now() where membership_id = m_dana;
  perform test_h.as_user(2);
  select count(*) into n from public.departments where organization_id = x;
  if n <> 1 then raise exception 'Accès révoqué : Dana doit revoir 1 département (vu %)', n; end if;
  perform test_h.as_user(1);
  insert into public.department_access_grants (organization_id, membership_id, department_id, expires_at)
    values (x, m_dana, d_com, now() - interval '1 day');
  perform test_h.as_user(2);
  select count(*) into n from public.departments where organization_id = x;
  if n <> 1 then raise exception 'Accès expiré ignoré : 1 département attendu (vu %)', n; end if;

  -- 8. Cross-tenant : Hal (org Y) ne touche pas aux permissions de X
  perform test_h.as_user(6);
  begin
    insert into public.member_permissions (organization_id, membership_id, permission_code, effect) values (y, m_dana, 'catalog.view', 'grant');
    raise exception 'FAILLE : surcharge cross-tenant';
  exception when insufficient_privilege or foreign_key_violation then null; end;
  select count(*) into n from public.role_permissions where organization_id = x;
  if n <> 0 then raise exception 'FUITE : role_permissions de X visibles par Hal'; end if;
  select count(*) into n from public.permission_changes where organization_id = x;
  if n <> 0 then raise exception 'FUITE : permission_changes de X visibles par Hal'; end if;

  -- 9. Invitations : mauvais e-mail, réutilisation, expiration
  select v into tok from ctx where k = 'tok_dana';
  begin perform public.accept_invitation(tok); raise exception 'FAILLE : réutilisation d''un jeton déjà accepté';
  exception when others then if sqlerrm like 'FAILLE%' then raise; end if; end;
  perform test_h.as_user(1);
  tok := public.create_invitation(x, 'hal@y.test', 'member');
  perform test_h.as_user(3);
  begin perform public.accept_invitation(tok); raise exception 'FAILLE : jeton accepté par un autre e-mail';
  exception when others then if sqlerrm like 'FAILLE%' then raise; end if; end;
  perform test_h.as_user(1);
  tok := public.create_invitation(x, 'late@x.test', 'member');
  begin perform public.create_invitation(x, 'dana@x.test', 'member'); raise exception 'FAILLE : invitation d''un membre actif';
  exception when unique_violation then null; end;
  begin perform public.create_invitation(x, 'adm@x.test', 'owner'); raise exception 'FAILLE : invitation owner';
  exception when others then if sqlerrm like 'FAILLE%' then raise; end if; end;
  perform test_h.as_user(4);
  begin perform public.create_invitation(x, 'adm@x.test', 'admin'); raise exception 'FAILLE : Fay invite un admin';
  exception when insufficient_privilege then null; end;

  -- 10. Historique des permissions
  perform test_h.as_user(1);
  select count(*) into n from public.permission_changes where organization_id = x;
  if n < 5 then raise exception 'L''historique doit tracer les changements (vu %)', n; end if;
  select count(*) into n from public.permission_changes where organization_id = x and source = 'role_permissions';
  if n <> 0 then raise exception 'L''amorçage des rôles ne doit pas polluer l''historique (vu %)', n; end if;
  perform test_h.as_user(2);
  select count(*) into n from public.permission_changes where organization_id = x;
  if n <> 0 then raise exception 'FUITE : Dana lit l''historique'; end if;

  -- 11. Permissions effectives du propriétaire = toutes
  perform test_h.as_user(1);
  select count(*) into n from public.effective_permissions(x);
  if n <> (select count(*) from public.permissions) then raise exception 'Le propriétaire doit avoir toutes les permissions (vu %)', n; end if;

  -- 12. Révocation d'accès : plus rien ne passe
  perform test_h.as_user(5);
  update public.memberships set status = 'revoked' where id = m_dana;
  perform test_h.as_user(2);
  select count(*) into n from public.departments where organization_id = x;
  if n <> 0 then raise exception 'FAILLE : accès maintenu après révocation (vu %)', n; end if;
  if public.has_permission(x, 'dashboard.view') then raise exception 'FAILLE : permission maintenue après révocation'; end if;
  begin perform public.create_invitation(x, 'q@x.test', 'member'); raise exception 'FAILLE';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
select 'OK : permissions Phase 2 vérifiées' as resultat;
