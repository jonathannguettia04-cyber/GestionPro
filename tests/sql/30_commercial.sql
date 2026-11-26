-- Tests Phase 3 : totaux serveur, numérotation, workflows devis/facture/paiement, permissions, isolation.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('0b000000-0000-0000-0000-000000000001', 'owner@x.test', '{"full_name":"Owner"}'),
  ('0b000000-0000-0000-0000-000000000002', 'dana@x.test',  '{"full_name":"Dana"}'),
  ('0b000000-0000-0000-0000-000000000003', 'eve@x.test',   '{"full_name":"Eve"}'),
  ('0b000000-0000-0000-0000-000000000004', 'gus@x.test',   '{"full_name":"Gus"}'),
  ('0b000000-0000-0000-0000-000000000005', 'hal@y.test',   '{"full_name":"Hal"}');

create schema test_h;
create function test_h.as_user(n int) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', ('0b000000-0000-0000-0000-00000000000' || n)::text, true) $$;
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;
grant usage on schema test_h to authenticated;
grant execute on function test_h.as_user(int) to authenticated;

set local role authenticated;
select test_h.as_user(1);
insert into ctx select 'x', public.create_organization('Entreprise X', 'printing', null, null, null, 'Africa/Abidjan',
  '{"default_tax_rate":18}'::jsonb, '[{"name":"Infographie"}]'::jsonb, '[]'::jsonb)::text;
select test_h.as_user(5);
insert into ctx select 'y', public.create_organization('Entreprise Y', 'events', null, null, null, 'Africa/Abidjan',
  '{}'::jsonb, '[]'::jsonb, '[]'::jsonb)::text;

-- Membres et droits de rôle supplémentaires (mise en place en superutilisateur)
reset role;
insert into public.memberships (organization_id, user_id, role)
select v::uuid, u, r::public.member_role from ctx, (values
  ('0b000000-0000-0000-0000-000000000002'::uuid, 'member'), ('0b000000-0000-0000-0000-000000000003'::uuid, 'member'),
  ('0b000000-0000-0000-0000-000000000004'::uuid, 'admin')) t(u, r) where k = 'x';
insert into public.department_members (department_id, membership_id, organization_id)
select d.id, m.id, d.organization_id from public.departments d join public.memberships m on m.organization_id = d.organization_id
 where d.name = 'Infographie' and m.user_id = '0b000000-0000-0000-0000-000000000002';
insert into public.role_permissions (organization_id, role, permission_code)
select v::uuid, 'member', c from ctx, unnest(array['clients.create', 'quotes.create', 'quotes.edit', 'invoices.view',
  'payments.view', 'expenses.view', 'expenses.create', 'expenses.edit', 'expenses.delete']) c where k = 'x';
set local role authenticated;

do $$
declare x uuid; y uuid; d_info uuid; c_dept uuid; c_null uuid; q1 uuid; q2 uuid; inv uuid; n int; t numeric; s text; num text;
        e1 uuid; e2 uuid; e3 uuid; js jsonb;
begin
  select v::uuid into x from ctx where k = 'x';
  select v::uuid into y from ctx where k = 'y';
  perform test_h.as_user(1);
  select id into d_info from public.departments where organization_id = x and name = 'Infographie';

  -- 1. Clients : visibilité par département
  perform test_h.as_user(2);
  insert into public.clients (organization_id, name, department_id) values (x, 'Client Infographie', d_info);
  insert into public.clients (organization_id, name) values (x, 'Client Général');
  select id into c_dept from public.clients where name = 'Client Infographie';
  select id into c_null from public.clients where name = 'Client Général';
  perform test_h.as_user(3);
  select count(*) into n from public.clients where organization_id = x;
  if n <> 1 then raise exception 'Eve doit voir 1 client (sans département), vu %', n; end if;
  begin insert into public.clients (organization_id, name, department_id) values (x, 'Intrus', d_info);
    raise exception 'FAILLE : Eve crée un client dans un département inaccessible';
  exception when insufficient_privilege then null; end;

  -- 2. Devis : totaux calculés par le serveur (XOF, 0 décimale)
  perform test_h.as_user(2);
  q1 := public.save_quote(x, null, c_dept, d_info, null, 'Test', jsonb_build_array(
    jsonb_build_object('description', 'Flyers A5', 'quantity', 10, 'unit_price', 1500, 'discount_rate', 10, 'tax_rate', 18),
    jsonb_build_object('description', 'Livraison', 'quantity', 2, 'unit_price', 2500, 'tax_rate', 0)));
  select subtotal, tax_total, total, discount_total, number into strict js from (
    select jsonb_build_object('s', subtotal, 't', tax_total, 'tot', total, 'd', discount_total, 'n', number) as j,
           subtotal, tax_total, total, discount_total, number from public.quotes where id = q1) z;
  select number into num from public.quotes where id = q1;
  if (select subtotal from public.quotes where id = q1) <> 18500 then raise exception 'subtotal attendu 18500'; end if;
  if (select discount_total from public.quotes where id = q1) <> 1500 then raise exception 'remise attendue 1500'; end if;
  if (select tax_total from public.quotes where id = q1) <> 2430 then raise exception 'taxe attendue 2430'; end if;
  if (select total from public.quotes where id = q1) <> 20930 then raise exception 'total attendu 20930'; end if;
  if num !~ '^DEV-[0-9]{4}-0001$' then raise exception 'numéro de devis inattendu: %', num; end if;
  q2 := public.save_quote(x, null, c_null, null, null, null, jsonb_build_array(
    jsonb_build_object('description', 'Arrondi', 'quantity', 1, 'unit_price', 100.5, 'tax_rate', 0)));
  if (select total from public.quotes where id = q2) <> 101 then raise exception 'arrondi XOF attendu 101'; end if;
  select number into num from public.quotes where id = q2;
  if num !~ '-0002$' then raise exception 'séquence attendue 0002, vu %', num; end if;

  -- 3. Le client ne peut rien forger : pas d'écriture directe sur devis/lignes/paiements
  begin update public.quotes set total = 1 where id = q1; raise exception 'FAILLE : update direct du total';
  exception when insufficient_privilege then null; end;
  begin insert into public.quotes (organization_id, client_id, total) values (x, c_dept, 1); raise exception 'FAILLE : insert direct devis';
  exception when insufficient_privilege then null; end;
  begin insert into public.quote_items (organization_id, quote_id, position, description, quantity, unit_price) values (x, q1, 9, 'x', 1, 1);
    raise exception 'FAILLE : insert direct ligne';
  exception when insufficient_privilege then null; end;
  begin perform public.save_quote(x, null, c_dept, d_info, null, null, '[{"description":"x","quantity":-1,"unit_price":5}]'::jsonb);
    raise exception 'FAILLE : quantité négative acceptée';
  exception when check_violation then null; end;
  begin perform public.save_quote(x, null, c_dept, d_info, null, null, '[]'::jsonb); raise exception 'FAILLE : devis vide';
  exception when invalid_parameter_value then null; end;

  -- 4. Visibilité des devis par département
  perform test_h.as_user(3);
  select count(*) into n from public.quotes where organization_id = x;
  if n <> 1 then raise exception 'Eve doit voir seulement le devis sans département (vu %)', n; end if;
  begin perform public.save_quote(x, null, c_dept, null, null, null, '[{"description":"x","quantity":1,"unit_price":5}]'::jsonb);
    raise exception 'FAILLE : Eve utilise un client inaccessible';
  exception when insufficient_privilege then null; end;

  -- 5. Workflow devis et permissions
  perform test_h.as_user(2);
  perform public.update_quote_status(q1, 'sent');
  begin perform public.update_quote_status(q1, 'accepted'); raise exception 'FAILLE : Dana valide sans quotes.approve';
  exception when insufficient_privilege then null; end;
  begin perform public.save_quote(x, q1, c_dept, d_info, null, null, '[{"description":"x","quantity":1,"unit_price":5}]'::jsonb);
    raise exception 'FAILLE : devis envoyé modifiable';
  exception when others then if sqlerrm like 'FAILLE%' then raise; end if; end;
  perform test_h.as_user(4);
  perform public.update_quote_status(q1, 'accepted');
  begin perform public.update_quote_status(q1, 'draft'); raise exception 'FAILLE : retour en brouillon';
  exception when invalid_parameter_value then null; end;

  -- 6. Facture : conversion, émission, numérotation
  begin perform public.convert_quote_to_invoice(q2); raise exception 'FAILLE : conversion d''un devis non accepté';
  exception when invalid_parameter_value then null; end;
  inv := public.convert_quote_to_invoice(q1);
  if (select total from public.invoices where id = inv) <> 20930 then raise exception 'La facture doit reprendre le total du devis'; end if;
  if (select number from public.invoices where id = inv) is not null then raise exception 'Pas de numéro avant émission'; end if;
  begin perform public.convert_quote_to_invoice(q1); raise exception 'FAILLE : double conversion';
  exception when unique_violation then null; end;
  perform test_h.as_user(2);
  begin perform public.issue_invoice(inv); raise exception 'FAILLE : Dana émet sans invoices.approve';
  exception when insufficient_privilege then null; end;
  perform test_h.as_user(4);
  s := public.issue_invoice(inv);
  if s !~ '^FAC-[0-9]{4}-0001$' then raise exception 'numéro de facture inattendu: %', s; end if;
  if (select due_date from public.invoices where id = inv) <> current_date + 30 then raise exception 'échéance attendue J+30'; end if;
  begin delete from public.invoice_items where invoice_id = inv; raise exception 'FAILLE : lignes d''une facture émise supprimables';
  exception when insufficient_privilege or sqlstate '55000' then null; end;

  -- 7. Paiements : acompte, solde, surpaiement, verrouillage
  begin perform public.record_payment(inv, 5000, 'cash', current_date, null, true); exception when insufficient_privilege then raise exception 'Gus (admin) doit pouvoir encaisser'; end;
  if (select status from public.invoices where id = inv) <> 'partially_paid' then raise exception 'statut attendu partially_paid'; end if;
  if (select amount_paid from public.invoices where id = inv) <> 5000 then raise exception 'amount_paid attendu 5000'; end if;
  begin perform public.record_payment(inv, 20000, 'cash', current_date, null, false); raise exception 'FAILLE : surpaiement accepté';
  exception when invalid_parameter_value then null; end;
  begin perform public.record_payment(inv, 100, 'cash', current_date + 1, null, false); raise exception 'FAILLE : date future acceptée';
  exception when invalid_parameter_value then null; end;
  begin perform public.cancel_invoice(inv); raise exception 'FAILLE : annulation avec paiements';
  exception when invalid_parameter_value then null; end;
  perform public.record_payment(inv, 15930, 'mobile_money', current_date, 'OM-123', false);
  if (select status from public.invoices where id = inv) <> 'paid' then raise exception 'statut attendu paid'; end if;
  begin perform public.record_payment(inv, 1, 'cash', current_date, null, false); raise exception 'FAILLE : paiement sur facture soldée';
  exception when invalid_parameter_value then null; end;
  begin insert into public.payments (organization_id, invoice_id, amount, method) values (x, inv, 1, 'cash'); raise exception 'FAILLE : insert direct paiement';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.payments where invoice_id = inv;
  if n <> 2 then raise exception '2 paiements attendus (vu %)', n; end if;

  -- 8. Isolation inter-entreprises
  perform test_h.as_user(5);
  select count(*) into n from (select id from public.clients union all select id from public.quotes union all select id from public.invoices
                               union all select id from public.payments union all select id from public.quote_items) z;
  if n <> 0 then raise exception 'FUITE : Hal voit % lignes de X', n; end if;
  begin perform public.record_payment(inv, 1, 'cash', current_date, null, false); raise exception 'FAILLE : paiement cross-tenant';
  exception when insufficient_privilege or invalid_parameter_value then null; end;
  begin perform public.save_quote(y, null, c_null, null, null, null, '[{"description":"x","quantity":1,"unit_price":5}]'::jsonb);
    raise exception 'FAILLE : client de X utilisé dans Y';
  exception when invalid_parameter_value then null; end;

  -- 9. Dépenses : validation et séparation des tâches
  perform test_h.as_user(2);
  insert into public.expenses (organization_id, category, amount, department_id) values (x, 'Matériel', 40000, d_info);
  select id into e1 from public.expenses where category = 'Matériel';
  begin perform public.set_expense_status(e1, 'approved'); raise exception 'FAILLE : Dana valide sans expenses.approve';
  exception when insufficient_privilege then null; end;
  begin insert into public.expenses (organization_id, category, amount, status) values (x, 'Triche', 10, 'approved');
    raise exception 'FAILLE : dépense créée déjà approuvée';
  exception when insufficient_privilege then null; end;
  perform test_h.as_user(4);
  perform public.set_expense_status(e1, 'approved');
  insert into public.expenses (organization_id, category, amount) values (x, 'Transport', 5000);
  select id into e2 from public.expenses where category = 'Transport';
  begin perform public.set_expense_status(e2, 'approved'); raise exception 'FAILLE : auto-validation par un admin';
  exception when insufficient_privilege then null; end;
  perform test_h.as_user(1);
  perform public.set_expense_status(e2, 'approved');   -- le propriétaire peut valider
  perform test_h.as_user(2);
  update public.expenses set amount = 1 where id = e1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILLE : dépense approuvée modifiable'; end if;
  delete from public.expenses where id = e1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILLE : dépense approuvée supprimable'; end if;

  -- 10. Indicateurs financiers : réservés à finance.view
  perform test_h.as_user(3);
  if public.finance_summary(x, current_date - 30, current_date) is not null then raise exception 'FUITE : Eve voit les chiffres financiers'; end if;
  perform test_h.as_user(1);
  js := public.finance_summary(x, current_date - 30, current_date);
  if (js ->> 'revenue_billed')::numeric <> 20930 then raise exception 'CA facturé attendu 20930, vu %', js ->> 'revenue_billed'; end if;
  if (js ->> 'collected')::numeric <> 20930 then raise exception 'encaissé attendu 20930'; end if;
  if (js ->> 'expenses_approved')::numeric <> 45000 then raise exception 'dépenses attendues 45000, vu %', js ->> 'expenses_approved'; end if;
  if (js ->> 'estimated_profit')::numeric <> -24070 then raise exception 'bénéfice estimé attendu -24070, vu %', js ->> 'estimated_profit'; end if;
  if (js ->> 'unpaid_total')::numeric <> 0 then raise exception 'impayé attendu 0'; end if;

  -- 11. Justificatifs : accès par permission d'expenses
  perform test_h.as_user(2);
  insert into storage.objects (bucket_id, name) values ('expense-receipts', x::text || '/recu.pdf');
  perform test_h.as_user(5);
  begin insert into storage.objects (bucket_id, name) values ('expense-receipts', x::text || '/pirate.pdf');
    raise exception 'FAILLE : dépôt de justificatif dans une autre entreprise';
  exception when insufficient_privilege then null; end;
  select count(*) into n from storage.objects where bucket_id = 'expense-receipts';
  if n <> 0 then raise exception 'FUITE : justificatifs de X visibles par Hal'; end if;
end $$;

rollback;
select 'OK : gestion commerciale Phase 3 vérifiée' as resultat;
