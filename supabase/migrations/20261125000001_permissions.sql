-- GestionPro — Phase 2 : organisation interne, permissions fines, invitations, visibilité par département

------------------------------------------------------------------ profils : e-mail (affichage dans la liste des collaborateurs)
alter table public.profiles add column email text;
update public.profiles p set email = lower(u.email) from auth.users u where u.id = p.id;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), lower(new.email));
  return new;
end $$;

------------------------------------------------------------------ catalogue de permissions (module.action)
create table public.permissions (
  code text primary key,
  module text not null,
  action text not null check (action in ('view', 'create', 'edit', 'delete', 'approve', 'export', 'assign', 'manage')),
  unique (module, action),
  check (code = module || '.' || action)
);
insert into public.permissions (code, module, action)
select m.module || '.' || a.action, m.module, a.action
from (values
  ('dashboard',   array['view']),
  ('finance',     array['view', 'export']),
  ('clients',     array['view', 'create', 'edit', 'delete', 'export']),
  ('catalog',     array['view', 'create', 'edit', 'delete']),
  ('quotes',      array['view', 'create', 'edit', 'delete', 'approve', 'export']),
  ('invoices',    array['view', 'create', 'edit', 'delete', 'approve', 'export']),
  ('payments',    array['view', 'create', 'edit', 'delete', 'export']),
  ('expenses',    array['view', 'create', 'edit', 'delete', 'approve', 'export']),
  ('tasks',       array['view', 'create', 'edit', 'delete', 'assign']),
  ('departments', array['view', 'create', 'edit', 'delete', 'assign', 'manage']),
  ('employees',   array['view', 'create', 'edit', 'delete', 'manage']),
  ('settings',    array['view', 'manage']),
  ('permissions', array['manage'])
) as m(module, actions)
cross join lateral unnest(m.actions) as a(action);

-- Modèles de rôles copiés dans chaque entreprise à sa création (puis personnalisables par entreprise)
create table public.role_permission_templates (
  role public.member_role not null check (role <> 'owner'),
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role, permission_code)
);
insert into public.role_permission_templates select 'admin', code from public.permissions;
insert into public.role_permission_templates select 'department_manager', c from unnest(array[
  'dashboard.view', 'clients.view', 'clients.create', 'clients.edit', 'catalog.view', 'quotes.view', 'quotes.create', 'quotes.edit',
  'invoices.view', 'expenses.view', 'expenses.create', 'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.assign',
  'departments.view', 'departments.assign', 'employees.view']) as c;
insert into public.role_permission_templates select 'member', c from unnest(array[
  'dashboard.view', 'clients.view', 'catalog.view', 'quotes.view', 'tasks.view', 'tasks.create', 'tasks.edit', 'departments.view']) as c;

create table public.role_permissions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role public.member_role not null check (role <> 'owner'),
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (organization_id, role, permission_code)
);

create or replace function public.seed_role_permissions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.role_permissions (organization_id, role, permission_code)
  select new.id, t.role, t.permission_code from public.role_permission_templates t;
  return new;
end $$;
create trigger organizations_seed_roles after insert on public.organizations
  for each row execute function public.seed_role_permissions();

insert into public.role_permissions (organization_id, role, permission_code)
select o.id, t.role, t.permission_code from public.organizations o cross join public.role_permission_templates t
on conflict do nothing;

------------------------------------------------------------------ autorisations individuelles et accès transversaux
create table public.member_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null,
  permission_code text not null references public.permissions(code) on delete cascade,
  effect text not null check (effect in ('grant', 'deny')),
  expires_at timestamptz,                         -- autorisation temporaire (null = permanente)
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (membership_id, permission_code),
  foreign key (membership_id, organization_id) references public.memberships (id, organization_id) on delete cascade
);

create table public.department_access_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null,
  department_id uuid not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (membership_id, organization_id) references public.memberships (id, organization_id) on delete cascade,
  foreign key (department_id, organization_id) references public.departments (id, organization_id) on delete cascade
);
create index department_access_grants_idx on public.department_access_grants (membership_id, department_id);

create table public.permission_changes (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  target_membership_id uuid,
  source text not null,
  op text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index permission_changes_org_idx on public.permission_changes (organization_id, created_at desc);

------------------------------------------------------------------ fonctions d'autorisation
create or replace function public.has_permission(p_org uuid, p_code text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare m_id uuid; m_role public.member_role; ov text;
begin
  select id, role into m_id, m_role from public.memberships
   where organization_id = p_org and user_id = (select auth.uid()) and status = 'active';
  if m_id is null then return false; end if;
  if m_role = 'owner' then return true; end if;
  select effect into ov from public.member_permissions
   where membership_id = m_id and permission_code = p_code and (expires_at is null or expires_at > now());
  if ov = 'deny' then return false; end if;
  if ov = 'grant' then return true; end if;
  return exists (select 1 from public.role_permissions rp
                  where rp.organization_id = p_org and rp.role = m_role and rp.permission_code = p_code);
end $$;

create or replace function public.effective_permissions(p_org uuid) returns setof text
language sql stable security definer set search_path = '' as $$
  select p.code from public.permissions p where public.has_permission(p_org, p.code) order by p.code
$$;

create or replace function public.membership_role(p_membership uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select role from public.memberships where id = p_membership
$$;

create or replace function public.is_department_manager(p_org uuid, p_dept uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.departments d join public.memberships m on m.id = d.manager_membership_id
    where d.id = p_dept and d.organization_id = p_org and m.user_id = (select auth.uid()) and m.status = 'active')
$$;

create or replace function public.can_access_department(p_org uuid, p_dept uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_org_member(p_org) and (
    public.has_org_role(p_org, array['owner', 'admin']::public.member_role[])
    or exists (
      select 1 from public.department_members dm join public.memberships m on m.id = dm.membership_id
      where dm.department_id = p_dept and dm.organization_id = p_org and m.user_id = (select auth.uid()) and m.status = 'active')
    or exists (
      select 1 from public.department_access_grants g join public.memberships m on m.id = g.membership_id
      where g.department_id = p_dept and g.organization_id = p_org and m.user_id = (select auth.uid()) and m.status = 'active'
        and g.revoked_at is null and (g.expires_at is null or g.expires_at > now()))
  )
$$;

create or replace function public.shares_department_with(p_org uuid, p_membership uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.department_members mine
    join public.memberships me on me.id = mine.membership_id and me.user_id = (select auth.uid()) and me.status = 'active'
    join public.department_members theirs on theirs.department_id = mine.department_id
    where mine.organization_id = p_org and theirs.membership_id = p_membership)
$$;

------------------------------------------------------------------ historique des modifications de permissions
create or replace function public.log_permission_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r_old jsonb; r_new jsonb; r jsonb; org uuid; tgt uuid;
begin
  if pg_trigger_depth() > 1 then            -- ex. amorçage automatique des rôles : pas de bruit dans l'historique
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op <> 'INSERT' then r_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then r_new := to_jsonb(new); end if;
  r := coalesce(r_new, r_old);
  org := (r ->> 'organization_id')::uuid;

  if tg_op = 'DELETE' and not exists (select 1 from public.organizations where id = org) then return old; end if;
  if tg_table_name = 'memberships' and tg_op = 'UPDATE'
     and r_old ->> 'role' = r_new ->> 'role' and r_old ->> 'status' = r_new ->> 'status' then
    return new;
  end if;

  tgt := case tg_table_name when 'memberships' then (r ->> 'id')::uuid
                            when 'role_permissions' then null
                            else (r ->> 'membership_id')::uuid end;
  insert into public.permission_changes (organization_id, actor_id, target_membership_id, source, op, detail)
  values (org, (select auth.uid()), tgt, tg_table_name, tg_op, jsonb_build_object('old', r_old, 'new', r_new));
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

create trigger role_permissions_audit after insert or update or delete on public.role_permissions
  for each row execute function public.log_permission_change();
create trigger member_permissions_audit after insert or update or delete on public.member_permissions
  for each row execute function public.log_permission_change();
create trigger access_grants_audit after insert or update or delete on public.department_access_grants
  for each row execute function public.log_permission_change();
create trigger memberships_audit after insert or update on public.memberships
  for each row execute function public.log_permission_change();

-- Un responsable désigné devient automatiquement membre de son département
create or replace function public.ensure_manager_is_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.manager_membership_id is not null then
    insert into public.department_members (department_id, membership_id, organization_id)
    values (new.id, new.manager_membership_id, new.organization_id) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger departments_manager_member after update of manager_membership_id on public.departments
  for each row execute function public.ensure_manager_is_member();

------------------------------------------------------------------ RLS : nouvelles tables
alter table public.permissions enable row level security;
alter table public.role_permission_templates enable row level security;
alter table public.role_permissions enable row level security;
alter table public.member_permissions enable row level security;
alter table public.department_access_grants enable row level security;
alter table public.permission_changes enable row level security;

create policy permissions_select on public.permissions for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (public.is_org_member(organization_id));
-- anti-escalade : on ne peut accorder que ce que l'on détient soi-même
create policy role_permissions_insert on public.role_permissions for insert to authenticated
  with check (public.has_permission(organization_id, 'permissions.manage') and public.has_permission(organization_id, permission_code));
create policy role_permissions_delete on public.role_permissions for delete to authenticated
  using (public.has_permission(organization_id, 'permissions.manage'));

create policy member_permissions_select on public.member_permissions for select to authenticated
  using (public.has_permission(organization_id, 'permissions.manage')
         or exists (select 1 from public.memberships m where m.id = membership_id and m.user_id = (select auth.uid())));
create policy member_permissions_insert on public.member_permissions for insert to authenticated
  with check (public.has_permission(organization_id, 'permissions.manage')
              and public.has_permission(organization_id, permission_code)
              and public.membership_role(membership_id) <> 'owner');
create policy member_permissions_update on public.member_permissions for update to authenticated
  using (public.has_permission(organization_id, 'permissions.manage') and public.membership_role(membership_id) <> 'owner')
  with check (public.has_permission(organization_id, 'permissions.manage') and public.membership_role(membership_id) <> 'owner');
create policy member_permissions_delete on public.member_permissions for delete to authenticated
  using (public.has_permission(organization_id, 'permissions.manage'));

create policy access_grants_select on public.department_access_grants for select to authenticated
  using (public.has_permission(organization_id, 'permissions.manage')
         or exists (select 1 from public.memberships m where m.id = membership_id and m.user_id = (select auth.uid())));
create policy access_grants_insert on public.department_access_grants for insert to authenticated
  with check (public.has_permission(organization_id, 'permissions.manage'));
create policy access_grants_update on public.department_access_grants for update to authenticated
  using (public.has_permission(organization_id, 'permissions.manage'))
  with check (public.has_permission(organization_id, 'permissions.manage'));

create policy permission_changes_select on public.permission_changes for select to authenticated
  using (public.has_permission(organization_id, 'permissions.manage'));

------------------------------------------------------------------ RLS : remplacement des politiques de la Phase 1
-- memberships : plus d'insertion/suppression côté client (création via invitation, retrait = status 'revoked')
drop policy memberships_select on public.memberships;
drop policy memberships_insert on public.memberships;
drop policy memberships_update on public.memberships;
drop policy memberships_delete on public.memberships;
revoke insert, delete on public.memberships from authenticated;

create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid())
         or (public.is_org_member(organization_id)
             and (public.has_permission(organization_id, 'employees.view') or public.shares_department_with(organization_id, id))));
create policy memberships_update on public.memberships for update to authenticated
  using (public.has_permission(organization_id, 'employees.manage') and role <> 'owner'
         and (role <> 'admin' or public.has_org_role(organization_id, array['owner']::public.member_role[])))
  with check (role <> 'owner'
         and (role <> 'admin' or public.has_org_role(organization_id, array['owner']::public.member_role[])));

-- departments : visibilité limitée aux départements accessibles
drop policy departments_select on public.departments;
drop policy departments_write on public.departments;
create policy departments_select on public.departments for select to authenticated
  using (public.can_access_department(organization_id, id));
create policy departments_insert on public.departments for insert to authenticated
  with check (public.has_permission(organization_id, 'departments.create'));
create policy departments_update on public.departments for update to authenticated
  using (public.has_permission(organization_id, 'departments.edit') and public.can_access_department(organization_id, id))
  with check (public.has_permission(organization_id, 'departments.edit'));
create policy departments_delete on public.departments for delete to authenticated
  using (public.has_permission(organization_id, 'departments.delete') and public.can_access_department(organization_id, id));
revoke update on public.departments from authenticated;
grant update (name, description, parent_id, manager_membership_id, is_active) on public.departments to authenticated;

drop policy department_members_select on public.department_members;
drop policy department_members_write on public.department_members;
create policy department_members_select on public.department_members for select to authenticated
  using (public.can_access_department(organization_id, department_id));
create policy department_members_insert on public.department_members for insert to authenticated
  with check (public.has_permission(organization_id, 'departments.manage')
              or (public.is_department_manager(organization_id, department_id) and public.has_permission(organization_id, 'departments.assign')));
create policy department_members_delete on public.department_members for delete to authenticated
  using (public.has_permission(organization_id, 'departments.manage')
         or (public.is_department_manager(organization_id, department_id) and public.has_permission(organization_id, 'departments.assign')));
revoke update on public.department_members from authenticated;

-- invitations : création uniquement via create_invitation() (jeton généré côté base, jamais stocké en clair)
drop policy invitations_all on public.invitations;
create policy invitations_select on public.invitations for select to authenticated
  using (public.has_permission(organization_id, 'employees.create'));
create policy invitations_update on public.invitations for update to authenticated
  using (public.has_permission(organization_id, 'employees.create'))
  with check (public.has_permission(organization_id, 'employees.create'));
revoke insert, update, delete on public.invitations from authenticated;
grant update (status) on public.invitations to authenticated;

------------------------------------------------------------------ droits
grant select on public.permissions, public.role_permissions, public.member_permissions,
  public.department_access_grants, public.permission_changes to authenticated;
grant insert, delete on public.role_permissions to authenticated;
grant insert, delete on public.member_permissions to authenticated;
grant update (effect, expires_at) on public.member_permissions to authenticated;
grant insert on public.department_access_grants to authenticated;
grant update (revoked_at, expires_at) on public.department_access_grants to authenticated;

------------------------------------------------------------------ invitations : création et acceptation
create or replace function public.create_invitation(p_org uuid, p_email text, p_role public.member_role, p_department uuid default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_email text := lower(btrim(coalesce(p_email, ''))); v_token text; v_id uuid;
begin
  if v_uid is null or not public.has_permission(p_org, 'employees.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role = 'owner' then raise exception 'invalid_role' using errcode = '22023'; end if;
  if p_role = 'admin' and not public.has_org_role(p_org, array['owner']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if p_department is not null and not exists (select 1 from public.departments where id = p_department and organization_id = p_org) then
    raise exception 'invalid_department' using errcode = '22023';
  end if;
  if exists (select 1 from public.memberships m join public.profiles pr on pr.id = m.user_id
              where m.organization_id = p_org and m.status = 'active' and pr.email = v_email) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.invitations (organization_id, email, role, department_id, token_hash, invited_by)
  values (p_org, v_email, p_role, p_department, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_uid)
  on conflict (organization_id, lower(email)) where status = 'pending'
  do update set token_hash = excluded.token_hash, role = excluded.role, department_id = excluded.department_id,
                expires_at = now() + interval '7 days', invited_by = excluded.invited_by
  returning id into v_id;

  insert into public.activity_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, v_uid, 'invitation.created', 'invitation', v_id, jsonb_build_object('email', v_email, 'role', p_role));
  return v_token;
end $$;

create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_email text; v_confirmed timestamptz; inv public.invitations; v_membership uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select lower(email), email_confirmed_at into v_email, v_confirmed from auth.users where id = v_uid;
  if v_confirmed is null then raise exception 'email_not_verified' using errcode = '42501'; end if;

  select * into inv from public.invitations
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') and status = 'pending' for update;
  if not found or inv.expires_at <= now() then raise exception 'invalid_invitation' using errcode = '22023'; end if;
  if lower(inv.email) <> v_email then raise exception 'invitation_email_mismatch' using errcode = '42501'; end if;

  insert into public.memberships (organization_id, user_id, role)
  values (inv.organization_id, v_uid, inv.role)
  on conflict (organization_id, user_id) do update
     set status = 'active', role = case when public.memberships.role = 'owner' then 'owner'::public.member_role else excluded.role end
  returning id into v_membership;

  if inv.department_id is not null then
    insert into public.department_members (department_id, membership_id, organization_id)
    values (inv.department_id, v_membership, inv.organization_id) on conflict do nothing;
  end if;
  update public.invitations set status = 'accepted', accepted_at = now() where id = inv.id;
  insert into public.activity_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (inv.organization_id, v_uid, 'invitation.accepted', 'invitation', inv.id, jsonb_build_object('role', inv.role));
  return inv.organization_id;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.has_permission(uuid, text), public.effective_permissions(uuid), public.membership_role(uuid),
  public.is_department_manager(uuid, uuid), public.can_access_department(uuid, uuid), public.shares_department_with(uuid, uuid),
  public.create_invitation(uuid, text, public.member_role, uuid), public.accept_invitation(text) to authenticated;
