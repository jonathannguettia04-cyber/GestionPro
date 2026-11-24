-- GestionPro — Phase 1 : fondations multi-entreprises
-- Tables : profiles, organizations, memberships, departments, department_members, invitations, activity_logs
-- Toute donnée métier porte un organization_id ; RLS activée partout.

------------------------------------------------------------------ types
create type public.member_role as enum ('owner', 'admin', 'department_manager', 'member');

------------------------------------------------------------------ utilitaires
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

------------------------------------------------------------------ profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------ organizations
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique,
  sector text not null check (sector in ('printing', 'events', 'other')),
  logo_path text,
  phone text check (phone is null or char_length(phone) <= 30),
  address text check (address is null or char_length(address) <= 300),
  email text check (email is null or char_length(email) <= 254),
  currency char(3) not null default 'XOF' check (currency in ('XOF', 'XAF', 'EUR')),
  timezone text not null default 'Africa/Abidjan',
  billing_settings jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated before update on public.organizations
  for each row execute function public.set_updated_at();

------------------------------------------------------------------ memberships
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'member',
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (id, organization_id)            -- cible des FK composites (anti cross-tenant)
);
create unique index memberships_one_owner on public.memberships (organization_id) where role = 'owner';
create index memberships_user_idx on public.memberships (user_id) where status = 'active';
create trigger memberships_updated before update on public.memberships
  for each row execute function public.set_updated_at();

------------------------------------------------------------------ fonctions d'autorisation (security definer : évitent la récursion RLS)
create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.status = 'active'
  )
$$;

create or replace function public.has_org_role(p_org uuid, p_roles public.member_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_org and m.user_id = (select auth.uid())
      and m.status = 'active' and m.role = any (p_roles)
  )
$$;

create or replace function public.shares_org_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships a
    join public.memberships b on b.organization_id = a.organization_id
    where a.user_id = (select auth.uid()) and a.status = 'active'
      and b.user_id = p_user and b.status = 'active'
  )
$$;

------------------------------------------------------------------ departments
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  description text check (description is null or char_length(description) <= 500),
  parent_id uuid,
  manager_membership_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (parent_id, organization_id) references public.departments (id, organization_id),
  foreign key (manager_membership_id, organization_id) references public.memberships (id, organization_id)
);
create unique index departments_org_name_idx on public.departments (organization_id, lower(name));
create trigger departments_updated before update on public.departments
  for each row execute function public.set_updated_at();

create table public.department_members (
  department_id uuid not null,
  membership_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (department_id, membership_id),
  foreign key (department_id, organization_id) references public.departments (id, organization_id) on delete cascade,
  foreign key (membership_id, organization_id) references public.memberships (id, organization_id) on delete cascade
);
create index department_members_membership_idx on public.department_members (membership_id);

------------------------------------------------------------------ invitations
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (char_length(email) <= 254),
  role public.member_role not null default 'member' check (role <> 'owner'),
  department_id uuid,
  token_hash text,                       -- renseigné à l'envoi (Phase 2) ; jamais le jeton en clair
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (department_id, organization_id) references public.departments (id, organization_id)
);
create unique index invitations_pending_idx on public.invitations (organization_id, lower(email)) where status = 'pending';

------------------------------------------------------------------ journal d'activité (append-only)
create table public.activity_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) <= 100),
  entity_type text check (entity_type is null or char_length(entity_type) <= 60),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_logs_org_created_idx on public.activity_logs (organization_id, created_at desc);

create or replace function public.log_activity(
  p_org uuid, p_action text, p_entity_type text default null, p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_org_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.activity_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, (select auth.uid()), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end $$;

------------------------------------------------------------------ RLS
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.departments enable row level security;
alter table public.department_members enable row level security;
alter table public.invitations enable row level security;
alter table public.activity_logs enable row level security;

-- profiles : soi-même + collègues d'une même entreprise
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_org_with(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- organizations : lecture membres ; modification propriétaire/admin ; création uniquement via create_organization()
create policy organizations_select on public.organizations for select to authenticated
  using (public.is_org_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_org_role(id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(id, array['owner', 'admin']::public.member_role[]));

-- memberships : lecture membres ; écriture owner/admin, jamais de rôle owner côté client
create policy memberships_select on public.memberships for select to authenticated
  using (public.is_org_member(organization_id));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]) and role <> 'owner');
create policy memberships_update on public.memberships for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]) and role <> 'owner')
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]) and role <> 'owner');
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]) and role <> 'owner');

-- departments / department_members : lecture membres (restriction par département : Phase 2)
create policy departments_select on public.departments for select to authenticated
  using (public.is_org_member(organization_id));
create policy departments_write on public.departments for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy department_members_select on public.department_members for select to authenticated
  using (public.is_org_member(organization_id));
create policy department_members_write on public.department_members for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

-- invitations : owner/admin uniquement
create policy invitations_all on public.invitations for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

-- activity_logs : lecture owner/admin ; aucune écriture directe (log_activity uniquement) ; pas d'update/delete
create policy activity_logs_select on public.activity_logs for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

------------------------------------------------------------------ droits de base
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.organizations, public.memberships, public.departments,
  public.department_members, public.invitations, public.activity_logs to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
grant update (name, logo_path, phone, address, email, currency, timezone, billing_settings) on public.organizations to authenticated;
grant insert, delete on public.memberships to authenticated;
grant update (role, status) on public.memberships to authenticated;
grant insert, update, delete on public.departments, public.department_members, public.invitations to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_org_member(uuid), public.has_org_role(uuid, public.member_role[]),
  public.shares_org_with(uuid), public.log_activity(uuid, text, text, uuid, jsonb) to authenticated;

------------------------------------------------------------------ création atomique d'une entreprise
create or replace function public.create_organization(
  p_name text, p_sector text, p_phone text, p_address text, p_email text, p_timezone text,
  p_billing jsonb, p_departments jsonb, p_invites jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_membership uuid;
  v_dept uuid;
  v_item jsonb;
  v_name text;
  v_email text;
  v_role text;
  v_tax numeric;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) not between 2 and 120 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if p_sector not in ('printing', 'events', 'other') then raise exception 'invalid_sector' using errcode = '22023'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  p_departments := coalesce(p_departments, '[]'::jsonb);
  p_invites := coalesce(p_invites, '[]'::jsonb);
  p_billing := coalesce(p_billing, '{}'::jsonb);
  if jsonb_typeof(p_departments) <> 'array' or jsonb_array_length(p_departments) > 20 then
    raise exception 'invalid_departments' using errcode = '22023';
  end if;
  if jsonb_typeof(p_invites) <> 'array' or jsonb_array_length(p_invites) > 20 then
    raise exception 'invalid_invites' using errcode = '22023';
  end if;

  v_tax := coalesce((p_billing ->> 'default_tax_rate')::numeric, 0);
  if v_tax < 0 or v_tax > 100 then raise exception 'invalid_tax' using errcode = '22023'; end if;

  -- garde-fou anti-abus : 5 entreprises créées par utilisateur au maximum
  if (select count(*) from public.organizations where created_by = v_uid) >= 5 then
    raise exception 'organization_limit_reached' using errcode = '53400';
  end if;

  insert into public.organizations (name, slug, sector, phone, address, email, timezone, billing_settings, created_by)
  values (
    p_name,
    regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    p_sector, nullif(btrim(p_phone), ''), nullif(btrim(p_address), ''), nullif(lower(btrim(p_email)), ''), p_timezone,
    jsonb_build_object(
      'quote_prefix', left(coalesce(nullif(p_billing ->> 'quote_prefix', ''), 'DEV'), 10),
      'invoice_prefix', left(coalesce(nullif(p_billing ->> 'invoice_prefix', ''), 'FAC'), 10),
      'default_tax_rate', v_tax,
      'payment_terms_days', least(greatest(coalesce((p_billing ->> 'payment_terms_days')::int, 30), 0), 365)
    ),
    v_uid
  ) returning id into v_org;

  insert into public.memberships (organization_id, user_id, role)
  values (v_org, v_uid, 'owner') returning id into v_membership;

  for v_item in select * from jsonb_array_elements(p_departments) loop
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    continue when v_name = '';
    insert into public.departments (organization_id, name, description, manager_membership_id)
    values (
      v_org, v_name, nullif(btrim(v_item ->> 'description'), ''),
      case when coalesce((v_item ->> 'manager_is_me')::boolean, false) then v_membership end
    ) returning id into v_dept;
    if coalesce((v_item ->> 'manager_is_me')::boolean, false) then
      insert into public.department_members (department_id, membership_id, organization_id)
      values (v_dept, v_membership, v_org);
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(p_invites) loop
    v_email := lower(btrim(coalesce(v_item ->> 'email', '')));
    v_role := coalesce(v_item ->> 'role', 'member');
    continue when v_email = '';
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_invite_email' using errcode = '22023'; end if;
    if v_role not in ('admin', 'department_manager', 'member') then raise exception 'invalid_invite_role' using errcode = '22023'; end if;
    insert into public.invitations (organization_id, email, role, invited_by)
    values (v_org, v_email, v_role::public.member_role, v_uid)
    on conflict do nothing;
  end loop;

  insert into public.activity_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_org, v_uid, 'organization.created', 'organization', v_org, jsonb_build_object('name', p_name));

  return v_org;
end $$;

revoke execute on function public.create_organization(text, text, text, text, text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_organization(text, text, text, text, text, text, jsonb, jsonb, jsonb) to authenticated;

------------------------------------------------------------------ Storage : logos (bucket privé, 1er segment du chemin = organization_id)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('organization-assets', 'organization-assets', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.storage_org_id(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end
$$;
grant execute on function public.storage_org_id(text) to authenticated;

create policy org_assets_select on storage.objects for select to authenticated
  using (bucket_id = 'organization-assets' and public.is_org_member(public.storage_org_id(name)));
create policy org_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'organization-assets'
    and public.has_org_role(public.storage_org_id(name), array['owner', 'admin']::public.member_role[]));
create policy org_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'organization-assets'
    and public.has_org_role(public.storage_org_id(name), array['owner', 'admin']::public.member_role[]));
create policy org_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'organization-assets'
    and public.has_org_role(public.storage_org_id(name), array['owner', 'admin']::public.member_role[]));
