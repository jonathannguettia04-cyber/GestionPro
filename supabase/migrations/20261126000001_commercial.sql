-- GestionPro — Phase 3 : gestion commerciale (clients, catalogue, devis, factures, paiements, dépenses)
-- Principe : le navigateur n'envoie JAMAIS de montants calculés. Devis, factures, paiements et statuts
-- ne s'écrivent que par des fonctions serveur (transactions) ; les totaux sont calculés par des triggers.

------------------------------------------------------------------ numérotation atomique
create table public.document_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('quote', 'invoice')),
  year int not null,
  last_value int not null default 0,
  primary key (organization_id, kind, year)
);
alter table public.document_counters enable row level security;   -- aucune politique : interne

create or replace function public.next_document_number(p_org uuid, p_kind text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_year int := extract(year from current_date)::int; v_val int; v_prefix text;
begin
  select coalesce(nullif(billing_settings ->> (p_kind || '_prefix'), ''), case p_kind when 'quote' then 'DEV' else 'FAC' end)
    into v_prefix from public.organizations where id = p_org;
  insert into public.document_counters as c (organization_id, kind, year, last_value) values (p_org, p_kind, v_year, 1)
  on conflict (organization_id, kind, year) do update set last_value = c.last_value + 1
  returning last_value into v_val;                       -- verrou de ligne : pas de doublon, même en concurrence
  return v_prefix || '-' || v_year || '-' || lpad(v_val::text, 4, '0');
end $$;

create or replace function public.currency_decimals(p_org uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case when currency in ('XOF', 'XAF') then 0 else 2 end from public.organizations where id = p_org
$$;

create or replace function public.can_see_row(p_org uuid, p_dept uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_org_member(p_org) and (p_dept is null or public.can_access_department(p_org, p_dept))
$$;

------------------------------------------------------------------ clients et catalogue
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 150),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 30),
  address text check (address is null or char_length(address) <= 300),
  notes text check (notes is null or char_length(notes) <= 1000),
  department_id uuid,
  is_active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (department_id, organization_id) references public.departments (id, organization_id)
);
create index clients_org_name_idx on public.clients (organization_id, lower(name));

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text check (reference is null or char_length(reference) between 1 and 40),
  name text not null check (char_length(name) between 2 and 150),
  description text check (description is null or char_length(description) <= 500),
  category text check (category is null or char_length(category) <= 60),
  unit text not null default 'unité' check (char_length(unit) between 1 and 20),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index catalog_items_ref_idx on public.catalog_items (organization_id, lower(reference)) where reference is not null;

------------------------------------------------------------------ devis
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  number text not null,
  client_id uuid not null,
  department_id uuid,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  issue_date date not null default current_date,
  valid_until date,
  notes text check (notes is null or char_length(notes) <= 1000),
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  discount_total numeric(14, 2) not null default 0 check (discount_total >= 0),
  tax_total numeric(14, 2) not null default 0 check (tax_total >= 0),
  total numeric(14, 2) not null default 0 check (total >= 0),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, number),
  unique (id, organization_id),
  foreign key (client_id, organization_id) references public.clients (id, organization_id),
  foreign key (department_id, organization_id) references public.departments (id, organization_id)
);
create index quotes_org_status_idx on public.quotes (organization_id, status, created_at desc);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null,
  position int not null,
  catalog_item_id uuid,
  description text not null check (char_length(description) between 1 and 300),
  unit text not null default 'unité' check (char_length(unit) between 1 and 20),
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  discount_rate numeric(5, 2) not null default 0 check (discount_rate between 0 and 100),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  line_subtotal numeric(14, 2) not null default 0,
  line_tax numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null default 0,
  foreign key (quote_id, organization_id) references public.quotes (id, organization_id) on delete cascade,
  foreign key (catalog_item_id, organization_id) references public.catalog_items (id, organization_id)
);
create index quote_items_quote_idx on public.quote_items (quote_id, position);

------------------------------------------------------------------ factures
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  number text,                                    -- attribué à l'émission (pas de trou dans la séquence)
  client_id uuid not null,
  department_id uuid,
  quote_id uuid,
  status text not null default 'draft' check (status in ('draft', 'issued', 'partially_paid', 'paid', 'cancelled')),
  issue_date date,
  due_date date,
  notes text check (notes is null or char_length(notes) <= 1000),
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  discount_total numeric(14, 2) not null default 0 check (discount_total >= 0),
  tax_total numeric(14, 2) not null default 0 check (tax_total >= 0),
  total numeric(14, 2) not null default 0 check (total >= 0),
  amount_paid numeric(14, 2) not null default 0 check (amount_paid >= 0),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_paid <= total),
  check (status = 'draft' or status = 'cancelled' or number is not null),
  unique (organization_id, number),
  unique (id, organization_id),
  foreign key (client_id, organization_id) references public.clients (id, organization_id),
  foreign key (department_id, organization_id) references public.departments (id, organization_id),
  foreign key (quote_id, organization_id) references public.quotes (id, organization_id)
);
create unique index invoices_one_per_quote_idx on public.invoices (quote_id) where quote_id is not null and status <> 'cancelled';
create index invoices_org_status_idx on public.invoices (organization_id, status, created_at desc);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null,
  position int not null,
  catalog_item_id uuid,
  description text not null check (char_length(description) between 1 and 300),
  unit text not null default 'unité' check (char_length(unit) between 1 and 20),
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  discount_rate numeric(5, 2) not null default 0 check (discount_rate between 0 and 100),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  line_subtotal numeric(14, 2) not null default 0,
  line_tax numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null default 0,
  foreign key (invoice_id, organization_id) references public.invoices (id, organization_id) on delete cascade,
  foreign key (catalog_item_id, organization_id) references public.catalog_items (id, organization_id)
);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id, position);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'bank_transfer', 'mobile_money', 'cheque', 'card', 'other')),
  paid_at date not null default current_date,
  reference text check (reference is null or char_length(reference) <= 100),
  is_deposit boolean not null default false,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (invoice_id, organization_id) references public.invoices (id, organization_id)
);
create index payments_org_date_idx on public.payments (organization_id, paid_at desc);
create index payments_invoice_idx on public.payments (invoice_id);

------------------------------------------------------------------ dépenses
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null check (char_length(category) between 1 and 60),
  description text check (description is null or char_length(description) <= 500),
  amount numeric(14, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  department_id uuid,
  responsible_membership_id uuid,
  receipt_path text check (receipt_path is null or char_length(receipt_path) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (department_id, organization_id) references public.departments (id, organization_id),
  foreign key (responsible_membership_id, organization_id) references public.memberships (id, organization_id)
);
create index expenses_org_date_idx on public.expenses (organization_id, expense_date desc);

create trigger clients_updated before update on public.clients for each row execute function public.set_updated_at();
create trigger catalog_items_updated before update on public.catalog_items for each row execute function public.set_updated_at();
create trigger quotes_updated before update on public.quotes for each row execute function public.set_updated_at();
create trigger invoices_updated before update on public.invoices for each row execute function public.set_updated_at();
create trigger expenses_updated before update on public.expenses for each row execute function public.set_updated_at();

------------------------------------------------------------------ calcul des lignes et totaux (côté base uniquement)
create or replace function public.compute_item_totals() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d int := public.currency_decimals(new.organization_id); v_status text;
begin
  if tg_table_name = 'quote_items' then
    select status into v_status from public.quotes where id = new.quote_id;
  else
    select status into v_status from public.invoices where id = new.invoice_id;
  end if;
  if v_status is distinct from 'draft' then raise exception 'document_locked' using errcode = '55000'; end if;
  new.line_subtotal := round(new.quantity * new.unit_price * (1 - new.discount_rate / 100), d);
  new.line_tax := round(new.line_subtotal * new.tax_rate / 100, d);
  new.line_total := new.line_subtotal + new.line_tax;
  return new;
end $$;
create trigger quote_items_compute before insert or update on public.quote_items for each row execute function public.compute_item_totals();
create trigger invoice_items_compute before insert or update on public.invoice_items for each row execute function public.compute_item_totals();

create or replace function public.guard_item_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if tg_table_name = 'quote_items' then select status into v_status from public.quotes where id = old.quote_id;
  else select status into v_status from public.invoices where id = old.invoice_id; end if;
  if v_status is not null and v_status <> 'draft' then raise exception 'document_locked' using errcode = '55000'; end if;
  return old;
end $$;
create trigger quote_items_guard_del before delete on public.quote_items for each row execute function public.guard_item_delete();
create trigger invoice_items_guard_del before delete on public.invoice_items for each row execute function public.guard_item_delete();

create or replace function public.recompute_quote_totals() returns trigger
language plpgsql security definer set search_path = '' as $$
declare q uuid := coalesce(new.quote_id, old.quote_id); o uuid := coalesce(new.organization_id, old.organization_id);
        d int := public.currency_decimals(coalesce(new.organization_id, old.organization_id));
begin
  update public.quotes x set
    subtotal = s.sub, tax_total = s.tax, total = s.sub + s.tax, discount_total = greatest(round(s.gross, d) - s.sub, 0)
  from (select coalesce(sum(line_subtotal), 0) sub, coalesce(sum(line_tax), 0) tax, coalesce(sum(quantity * unit_price), 0) gross
          from public.quote_items where quote_id = q) s
  where x.id = q and x.organization_id = o;
  return null;
end $$;
create trigger quote_items_totals after insert or update or delete on public.quote_items for each row execute function public.recompute_quote_totals();

create or replace function public.recompute_invoice_totals() returns trigger
language plpgsql security definer set search_path = '' as $$
declare i uuid := coalesce(new.invoice_id, old.invoice_id); o uuid := coalesce(new.organization_id, old.organization_id);
        d int := public.currency_decimals(coalesce(new.organization_id, old.organization_id));
begin
  update public.invoices x set
    subtotal = s.sub, tax_total = s.tax, total = s.sub + s.tax, discount_total = greatest(round(s.gross, d) - s.sub, 0)
  from (select coalesce(sum(line_subtotal), 0) sub, coalesce(sum(line_tax), 0) tax, coalesce(sum(quantity * unit_price), 0) gross
          from public.invoice_items where invoice_id = i) s
  where x.id = i and x.organization_id = o;
  return null;
end $$;
create trigger invoice_items_totals after insert or update or delete on public.invoice_items for each row execute function public.recompute_invoice_totals();

create or replace function public.assign_quote_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.number := public.next_document_number(new.organization_id, 'quote');
  if new.valid_until is null then new.valid_until := new.issue_date + 30; end if;
  return new;
end $$;
create trigger quotes_number before insert on public.quotes for each row execute function public.assign_quote_number();

------------------------------------------------------------------ RLS (lecture) et droits
alter table public.clients enable row level security;
alter table public.catalog_items enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;

create policy clients_select on public.clients for select to authenticated
  using (public.has_permission(organization_id, 'clients.view') and public.can_see_row(organization_id, department_id));
create policy clients_insert on public.clients for insert to authenticated
  with check (public.has_permission(organization_id, 'clients.create') and public.can_see_row(organization_id, department_id));
create policy clients_update on public.clients for update to authenticated
  using (public.has_permission(organization_id, 'clients.edit') and public.can_see_row(organization_id, department_id))
  with check (public.has_permission(organization_id, 'clients.edit') and public.can_see_row(organization_id, department_id));
create policy clients_delete on public.clients for delete to authenticated
  using (public.has_permission(organization_id, 'clients.delete') and public.can_see_row(organization_id, department_id));

create policy catalog_select on public.catalog_items for select to authenticated using (public.has_permission(organization_id, 'catalog.view'));
create policy catalog_insert on public.catalog_items for insert to authenticated with check (public.has_permission(organization_id, 'catalog.create'));
create policy catalog_update on public.catalog_items for update to authenticated
  using (public.has_permission(organization_id, 'catalog.edit')) with check (public.has_permission(organization_id, 'catalog.edit'));
create policy catalog_delete on public.catalog_items for delete to authenticated using (public.has_permission(organization_id, 'catalog.delete'));

create policy quotes_select on public.quotes for select to authenticated
  using (public.has_permission(organization_id, 'quotes.view') and public.can_see_row(organization_id, department_id));
create policy quote_items_select on public.quote_items for select to authenticated
  using (exists (select 1 from public.quotes q where q.id = quote_id and q.organization_id = organization_id));
create policy invoices_select on public.invoices for select to authenticated
  using (public.has_permission(organization_id, 'invoices.view') and public.can_see_row(organization_id, department_id));
create policy invoice_items_select on public.invoice_items for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.organization_id = organization_id));
create policy payments_select on public.payments for select to authenticated
  using (public.has_permission(organization_id, 'payments.view')
         and exists (select 1 from public.invoices i where i.id = invoice_id and i.organization_id = organization_id));

create policy expenses_select on public.expenses for select to authenticated
  using (public.has_permission(organization_id, 'expenses.view') and public.can_see_row(organization_id, department_id));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.has_permission(organization_id, 'expenses.create') and public.can_see_row(organization_id, department_id) and status = 'pending');
create policy expenses_update on public.expenses for update to authenticated
  using (public.has_permission(organization_id, 'expenses.edit') and public.can_see_row(organization_id, department_id) and status = 'pending')
  with check (public.has_permission(organization_id, 'expenses.edit') and public.can_see_row(organization_id, department_id) and status = 'pending');
create policy expenses_delete on public.expenses for delete to authenticated
  using (public.has_permission(organization_id, 'expenses.delete') and public.can_see_row(organization_id, department_id) and status <> 'approved');

grant select on public.clients, public.catalog_items, public.quotes, public.quote_items, public.invoices, public.invoice_items,
  public.payments, public.expenses to authenticated;
grant insert (organization_id, name, email, phone, address, notes, department_id, is_active) on public.clients to authenticated;
grant update (name, email, phone, address, notes, department_id, is_active) on public.clients to authenticated;
grant delete on public.clients to authenticated;
grant insert (organization_id, reference, name, description, category, unit, unit_price, tax_rate, is_active) on public.catalog_items to authenticated;
grant update (reference, name, description, category, unit, unit_price, tax_rate, is_active) on public.catalog_items to authenticated;
grant delete on public.catalog_items to authenticated;
grant insert (organization_id, category, description, amount, expense_date, department_id, responsible_membership_id, receipt_path) on public.expenses to authenticated;
grant update (category, description, amount, expense_date, department_id, responsible_membership_id, receipt_path) on public.expenses to authenticated;
grant delete on public.expenses to authenticated;

------------------------------------------------------------------ justificatifs de dépenses : bucket privé, accès par permission
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts' and public.has_permission(public.storage_org_id(name), 'expenses.view'));
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-receipts' and public.has_permission(public.storage_org_id(name), 'expenses.create'));
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'expense-receipts' and public.has_permission(public.storage_org_id(name), 'expenses.delete'));

------------------------------------------------------------------ fonctions métier (transactions serveur)
create or replace function public._require(p_org uuid, p_code text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.has_permission(p_org, p_code) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

create or replace function public._write_items(p_kind text, p_org uuid, p_doc uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_pos int := 0; v_default_tax numeric; v_tbl text; v_col text; v_desc text; v_cat uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;
  select coalesce((billing_settings ->> 'default_tax_rate')::numeric, 0) into v_default_tax from public.organizations where id = p_org;
  v_tbl := case p_kind when 'quote' then 'quote_items' else 'invoice_items' end;
  v_col := case p_kind when 'quote' then 'quote_id' else 'invoice_id' end;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pos := v_pos + 1;
    v_desc := btrim(coalesce(v_item ->> 'description', ''));
    if v_desc = '' then raise exception 'invalid_items' using errcode = '22023'; end if;
    v_cat := nullif(v_item ->> 'catalog_item_id', '')::uuid;
    execute format(
      'insert into public.%I (organization_id, %I, position, catalog_item_id, description, unit, quantity, unit_price, discount_rate, tax_rate)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', v_tbl, v_col)
    using p_org, p_doc, v_pos, v_cat, v_desc, coalesce(nullif(btrim(v_item ->> 'unit'), ''), 'unité'),
          (v_item ->> 'quantity')::numeric, (v_item ->> 'unit_price')::numeric,
          coalesce((v_item ->> 'discount_rate')::numeric, 0), coalesce((v_item ->> 'tax_rate')::numeric, v_default_tax);
  end loop;
end $$;

create or replace function public._check_client(p_org uuid, p_client uuid, p_dept uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_cdept uuid;
begin
  select department_id into v_cdept from public.clients where id = p_client and organization_id = p_org;
  if not found then raise exception 'invalid_client' using errcode = '22023'; end if;
  if not public.can_see_row(p_org, v_cdept) or not public.can_see_row(p_org, p_dept) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

create or replace function public._log(p_org uuid, p_action text, p_type text, p_id uuid, p_meta jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.activity_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, (select auth.uid()), p_action, p_type, p_id, p_meta)
$$;

create or replace function public.save_quote(p_org uuid, p_quote uuid, p_client uuid, p_department uuid, p_valid_until date, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_quote; q record;
begin
  perform public._require(p_org, case when p_quote is null then 'quotes.create' else 'quotes.edit' end);
  perform public._check_client(p_org, p_client, p_department);
  if p_notes is not null and char_length(p_notes) > 1000 then raise exception 'invalid_notes' using errcode = '22023'; end if;
  if p_quote is null then
    insert into public.quotes (organization_id, client_id, department_id, valid_until, notes)
    values (p_org, p_client, p_department, p_valid_until, nullif(btrim(p_notes), '')) returning id into v_id;
  else
    select * into q from public.quotes where id = p_quote and organization_id = p_org for update;
    if not found or not public.can_see_row(p_org, q.department_id) then raise exception 'forbidden' using errcode = '42501'; end if;
    if q.status <> 'draft' then raise exception 'document_locked' using errcode = '55000'; end if;
    update public.quotes set client_id = p_client, department_id = p_department,
      valid_until = coalesce(p_valid_until, valid_until), notes = nullif(btrim(p_notes), '') where id = p_quote;
    delete from public.quote_items where quote_id = p_quote;
  end if;
  perform public._write_items('quote', p_org, v_id, p_items);
  perform public._log(p_org, case when p_quote is null then 'quote.created' else 'quote.updated' end, 'quote', v_id);
  return v_id;
end $$;

create or replace function public.update_quote_status(p_quote uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare q record;
begin
  select * into q from public.quotes where id = p_quote for update;
  if not found or (select auth.uid()) is null or not public.can_see_row(q.organization_id, q.department_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if q.status = 'draft' and p_status = 'sent' then perform public._require(q.organization_id, 'quotes.edit');
  elsif q.status = 'sent' and p_status in ('accepted', 'rejected') then perform public._require(q.organization_id, 'quotes.approve');
  elsif q.status = 'sent' and p_status = 'expired' then perform public._require(q.organization_id, 'quotes.edit');
  else raise exception 'invalid_transition' using errcode = '22023';
  end if;
  update public.quotes set status = p_status where id = p_quote;
  perform public._log(q.organization_id, 'quote.' || p_status, 'quote', p_quote, jsonb_build_object('number', q.number));
end $$;

create or replace function public.save_invoice(p_org uuid, p_invoice uuid, p_client uuid, p_department uuid, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_invoice; i record;
begin
  perform public._require(p_org, case when p_invoice is null then 'invoices.create' else 'invoices.edit' end);
  perform public._check_client(p_org, p_client, p_department);
  if p_notes is not null and char_length(p_notes) > 1000 then raise exception 'invalid_notes' using errcode = '22023'; end if;
  if p_invoice is null then
    insert into public.invoices (organization_id, client_id, department_id, notes)
    values (p_org, p_client, p_department, nullif(btrim(p_notes), '')) returning id into v_id;
  else
    select * into i from public.invoices where id = p_invoice and organization_id = p_org for update;
    if not found or not public.can_see_row(p_org, i.department_id) then raise exception 'forbidden' using errcode = '42501'; end if;
    if i.status <> 'draft' then raise exception 'document_locked' using errcode = '55000'; end if;
    update public.invoices set client_id = p_client, department_id = p_department, notes = nullif(btrim(p_notes), '') where id = p_invoice;
    delete from public.invoice_items where invoice_id = p_invoice;
  end if;
  perform public._write_items('invoice', p_org, v_id, p_items);
  perform public._log(p_org, case when p_invoice is null then 'invoice.created' else 'invoice.updated' end, 'invoice', v_id);
  return v_id;
end $$;

create or replace function public.convert_quote_to_invoice(p_quote uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare q record; v_id uuid;
begin
  select * into q from public.quotes where id = p_quote for update;
  if not found or (select auth.uid()) is null or not public.can_see_row(q.organization_id, q.department_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public._require(q.organization_id, 'invoices.create');
  if q.status <> 'accepted' then raise exception 'quote_not_accepted' using errcode = '22023'; end if;
  if exists (select 1 from public.invoices where quote_id = p_quote and status <> 'cancelled') then
    raise exception 'already_converted' using errcode = '23505';
  end if;
  insert into public.invoices (organization_id, client_id, department_id, quote_id, notes)
  values (q.organization_id, q.client_id, q.department_id, q.id, q.notes) returning id into v_id;
  insert into public.invoice_items (organization_id, invoice_id, position, catalog_item_id, description, unit, quantity, unit_price, discount_rate, tax_rate)
  select organization_id, v_id, position, catalog_item_id, description, unit, quantity, unit_price, discount_rate, tax_rate
    from public.quote_items where quote_id = p_quote order by position;
  perform public._log(q.organization_id, 'invoice.created_from_quote', 'invoice', v_id, jsonb_build_object('quote', q.number));
  return v_id;
end $$;

create or replace function public.issue_invoice(p_invoice uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare i record; v_number text; v_terms int;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found or (select auth.uid()) is null or not public.can_see_row(i.organization_id, i.department_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public._require(i.organization_id, 'invoices.approve');
  if i.status <> 'draft' then raise exception 'invalid_transition' using errcode = '22023'; end if;
  if i.total <= 0 then raise exception 'empty_invoice' using errcode = '22023'; end if;
  select coalesce((billing_settings ->> 'payment_terms_days')::int, 30) into v_terms from public.organizations where id = i.organization_id;
  v_number := public.next_document_number(i.organization_id, 'invoice');
  update public.invoices set number = v_number, status = 'issued', issue_date = current_date, due_date = current_date + v_terms where id = p_invoice;
  perform public._log(i.organization_id, 'invoice.issued', 'invoice', p_invoice, jsonb_build_object('number', v_number));
  return v_number;
end $$;

create or replace function public.cancel_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i record;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found or (select auth.uid()) is null or not public.can_see_row(i.organization_id, i.department_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public._require(i.organization_id, 'invoices.approve');
  if i.status not in ('draft', 'issued') then raise exception 'invalid_transition' using errcode = '22023'; end if;
  if i.amount_paid > 0 then raise exception 'has_payments' using errcode = '22023'; end if;
  update public.invoices set status = 'cancelled' where id = p_invoice;
  perform public._log(i.organization_id, 'invoice.cancelled', 'invoice', p_invoice, jsonb_build_object('number', i.number));
end $$;

create or replace function public.record_payment(p_invoice uuid, p_amount numeric, p_method text, p_paid_at date, p_reference text, p_is_deposit boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i record; v_amount numeric; v_id uuid;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found or (select auth.uid()) is null or not public.can_see_row(i.organization_id, i.department_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public._require(i.organization_id, 'payments.create');
  if i.status not in ('issued', 'partially_paid') then raise exception 'invoice_not_payable' using errcode = '22023'; end if;
  v_amount := round(coalesce(p_amount, 0), public.currency_decimals(i.organization_id));
  if v_amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if v_amount > i.total - i.amount_paid then raise exception 'overpayment' using errcode = '22023'; end if;
  if p_paid_at is null or p_paid_at > current_date then raise exception 'invalid_date' using errcode = '22023'; end if;
  insert into public.payments (organization_id, invoice_id, amount, method, paid_at, reference, is_deposit)
  values (i.organization_id, p_invoice, v_amount, p_method, p_paid_at, nullif(btrim(p_reference), ''), coalesce(p_is_deposit, false))
  returning id into v_id;
  update public.invoices set amount_paid = amount_paid + v_amount,
    status = case when amount_paid + v_amount = total then 'paid' else 'partially_paid' end where id = p_invoice;
  perform public._log(i.organization_id, 'payment.recorded', 'payment', v_id, jsonb_build_object('invoice', i.number, 'amount', v_amount));
  return v_id;
end $$;

create or replace function public.set_expense_status(p_expense uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare e record;
begin
  select * into e from public.expenses where id = p_expense for update;
  if not found or (select auth.uid()) is null or not public.can_see_row(e.organization_id, e.department_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public._require(e.organization_id, 'expenses.approve');
  if p_status not in ('approved', 'rejected') or e.status <> 'pending' then raise exception 'invalid_transition' using errcode = '22023'; end if;
  -- séparation des tâches : seul le propriétaire peut valider sa propre dépense
  if e.created_by = (select auth.uid()) and not public.has_org_role(e.organization_id, array['owner']::public.member_role[]) then
    raise exception 'self_approval' using errcode = '42501';
  end if;
  update public.expenses set status = p_status where id = p_expense;
  perform public._log(e.organization_id, 'expense.' || p_status, 'expense', p_expense, jsonb_build_object('amount', e.amount));
end $$;

-- Indicateurs : SECURITY INVOKER => la RLS (départements) s'applique ; réservé à finance.view
create or replace function public.finance_summary(p_org uuid, p_from date, p_to date) returns jsonb
language plpgsql stable set search_path = '' as $$
declare r jsonb;
begin
  if not public.has_permission(p_org, 'finance.view') then return null; end if;
  select jsonb_build_object(
    'revenue_billed', coalesce((select sum(total) from public.invoices where organization_id = p_org and status in ('issued', 'partially_paid', 'paid') and issue_date between p_from and p_to), 0),
    'collected', coalesce((select sum(amount) from public.payments where organization_id = p_org and paid_at between p_from and p_to), 0),
    'expenses_approved', coalesce((select sum(amount) from public.expenses where organization_id = p_org and status = 'approved' and expense_date between p_from and p_to), 0),
    'unpaid_total', coalesce((select sum(total - amount_paid) from public.invoices where organization_id = p_org and status in ('issued', 'partially_paid')), 0),
    'unpaid_count', (select count(*) from public.invoices where organization_id = p_org and status in ('issued', 'partially_paid')),
    'by_department', coalesce((
      select jsonb_agg(jsonb_build_object('department_id', d.id, 'name', d.name,
        'revenue', coalesce((select sum(total) from public.invoices i where i.department_id = d.id and i.status in ('issued', 'partially_paid', 'paid') and i.issue_date between p_from and p_to), 0),
        'expenses', coalesce((select sum(amount) from public.expenses e where e.department_id = d.id and e.status = 'approved' and e.expense_date between p_from and p_to), 0)) order by d.name)
      from public.departments d where d.organization_id = p_org and d.is_active), '[]'::jsonb)
  ) into r;
  return r || jsonb_build_object('estimated_profit', (r ->> 'revenue_billed')::numeric - (r ->> 'expenses_approved')::numeric);
end $$;

------------------------------------------------------------------ droits d'exécution
revoke execute on all functions in schema public from public, anon;
grant execute on function public.save_quote(uuid, uuid, uuid, uuid, date, text, jsonb), public.update_quote_status(uuid, text),
  public.save_invoice(uuid, uuid, uuid, uuid, text, jsonb), public.convert_quote_to_invoice(uuid), public.issue_invoice(uuid),
  public.cancel_invoice(uuid), public.record_payment(uuid, numeric, text, date, text, boolean), public.set_expense_status(uuid, text),
  public.finance_summary(uuid, date, date), public.can_see_row(uuid, uuid) to authenticated;
