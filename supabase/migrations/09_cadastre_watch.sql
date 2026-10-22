-- Hlídač katastru: hlídané nemovitosti a zjištěné změny (náhrada Make scénáře + Google tabulky).
create table if not exists public.cadastre_watch (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  label text not null,
  municipality text,
  part_name text,
  kind text not null default 'č.p.' check (kind in ('č.p.', 'č.ev.', 'parcela')),
  number text not null,
  unit_no text,
  note text,
  code bigint,
  active boolean not null default true,
  last_state text,
  last_checked timestamptz,
  last_change_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create table if not exists public.cadastre_changes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  watch_id uuid not null references public.cadastre_watch(id) on delete cascade,
  at timestamptz not null default now(),
  old_state text,
  new_state text,
  seen boolean not null default false
);
create index if not exists cadastre_watch_account on public.cadastre_watch(account_id);
create index if not exists cadastre_changes_account on public.cadastre_changes(account_id, at desc);
alter table public.cadastre_watch enable row level security;
alter table public.cadastre_changes enable row level security;
drop policy if exists cadastre_watch_all on public.cadastre_watch;
create policy cadastre_watch_all on public.cadastre_watch for all to authenticated using (public.is_member(account_id)) with check (public.is_member(account_id));
drop policy if exists cadastre_changes_all on public.cadastre_changes;
create policy cadastre_changes_all on public.cadastre_changes for all to authenticated using (public.is_member(account_id)) with check (public.is_member(account_id));

-- převod stávajícího seznamu z Google tabulky „Hlídač katastru“ (včetně posledního stavu)
insert into public.cadastre_watch (account_id, label, municipality, part_name, kind, number, unit_no, note, code, last_state, last_checked, last_change_at)
select a.id, v.label, v.municipality, v.part_name, v.kind, v.number, v.unit_no, v.note, v.code, v.last_state, v.last_checked, v.last_change_at
from (select id from public.accounts order by created_at limit 1) a,
(values
  ('Moje – dům Zahradní 994, Valtice', 'Valtice', null, 'č.p.', '994', null, null, 176699, 'LV 3561 (k.ú. Valtice) | plomby: žádné | jednotek v domě: 0', '2026-10-22 16:00+02', '2026-10-20 15:39+02'),
  ('Fazekaš – byt Zákostelní 665/9, Praha 9', 'Praha', 'Vysočany', 'č.p.', '665', '2', null, 490245, 'LV 6253 (k.ú. Vysočany) | plomby: V-67187/2026 (pracoviště 101)', '2026-10-22 16:00+02', '2026-10-19 13:25+02'),
  ('Nohel – byt Valtice 1269/2', 'Valtice', null, 'č.p.', '1269', '2', null, 176699, 'LV 3690 (k.ú. Valtice) | plomby: žádné', '2026-10-22 16:00+02', '2026-10-21 10:01+02'),
  ('Byt Ctiradova 440/5, Praha 4 (Nusle)', 'Praha', 'Nusle', 'č.p.', '440', '5', null, 490156, 'LV 15033 (k.ú. Nusle) | plomby: žádné', '2026-10-22 16:00+02', '2026-10-19 21:14+02'),
  ('Byt Karlovice 251/11', 'Karlovice', 'Karlovice', 'č.p.', '251', '11', 'k.ú. Nové Purkartice, okr. Bruntál', 63380, 'LV 190 (k.ú. Nové Purkartice) | plomby: žádné', '2026-10-22 16:00+02', '2026-10-19 21:14+02'),
  ('Garáž Valtice (parc. 164)', 'Valtice', null, 'parcela', '164', null, 'garáž bez čp/če na parcele 164', 776696, 'LV 3597 (k.ú. Valtice) | plomby: žádné | výměra: 18 m²', '2026-10-22 16:00+02', '2026-10-19 21:15+02'),
  ('Pozemek u Coopu, Valtice (parc. 640/4)', 'Valtice', null, 'parcela', '640/4', null, null, 776696, 'LV 3561 (k.ú. Valtice) | plomby: žádné | výměra: 105 m²', '2026-10-22 16:00+02', '2026-10-19 21:15+02'),
  ('Byt Nádražní 371/8, Město Albrechtice', 'Město Albrechtice', null, 'č.p.', '371', '8', 'Nádražní 371/17 (č.o. 17), LV 947', 93394, 'LV 947 (k.ú. Město Albrechtice) | plomby: žádné', '2026-10-22 16:00+02', '2026-10-19 21:16+02'),
  ('RD Moravský Písek č.p. 155', 'Moravský Písek', null, 'č.p.', '155', null, 'parc. 510, LV 885', 99236, 'LV 885 (k.ú. Moravský Písek) | plomby: žádné | jednotek v domě: 0', '2026-10-22 16:00+02', '2026-10-19 21:16+02'),
  ('RD Vrbice č.p. 156', 'Vrbice', null, 'č.p.', '156', null, 'parc. St. 93/1, k.ú. Vrbice u Velkých Pavlovic', 185965, 'LV 11073 (k.ú. Vrbice u Velkých Pavlovic) | plomby: žádné | jednotek v domě: 0', '2026-10-22 16:00+02', '2026-10-19 21:18+02'),
  ('Vinohrad Vrbice (parc. 2741)', 'Vrbice', null, 'parcela', '2741', null, 'k.ú. Vrbice u Velkých Pavlovic, LV 379, podíl 4/8', 785962, 'LV 379 (k.ú. Vrbice u Velkých Pavlovic) | plomby: žádné | výměra: 2233 m²', '2026-10-22 16:00+02', '2026-10-19 21:18+02'),
  ('Vinný sklep Vrbice č. 401 (pozemek obce parc. 857/1)', 'Vrbice', null, 'parcela', '857/1', null, 'Sklep není v katastru evidován – hlídá se jen pozemek obce nad ním (LV 10001)', 785962, 'LV 10001 (k.ú. Vrbice u Velkých Pavlovic) | plomby: žádné | výměra: 17524 m²', '2026-10-22 16:00+02', '2026-10-19 21:22+02')
) as v(label, municipality, part_name, kind, number, unit_no, note, code, last_state, last_checked, last_change_at)
where not exists (select 1 from public.cadastre_watch);

-- kontrola 2× denně (10:00 a 16:00 pražského času; funkce sama pozná hodinu)
select cron.unschedule(jobname) from cron.job where jobname like 'cadastre-watch-%';
select cron.schedule('cadastre-watch-a', '2 8 * * *', $$select net.http_post(url := 'https://aowceqpaawxeugalapgx.supabase.co/functions/v1/cadastre-watch', headers := jsonb_build_object('Content-Type','application/json','x-cron-key',(select decrypted_secret from vault.decrypted_secrets where name='cron_key')), body := '{"action":"check","cron":true}'::jsonb)$$);
select cron.schedule('cadastre-watch-b', '2 9 * * *', $$select net.http_post(url := 'https://aowceqpaawxeugalapgx.supabase.co/functions/v1/cadastre-watch', headers := jsonb_build_object('Content-Type','application/json','x-cron-key',(select decrypted_secret from vault.decrypted_secrets where name='cron_key')), body := '{"action":"check","cron":true}'::jsonb)$$);
select cron.schedule('cadastre-watch-c', '2 14 * * *', $$select net.http_post(url := 'https://aowceqpaawxeugalapgx.supabase.co/functions/v1/cadastre-watch', headers := jsonb_build_object('Content-Type','application/json','x-cron-key',(select decrypted_secret from vault.decrypted_secrets where name='cron_key')), body := '{"action":"check","cron":true}'::jsonb)$$);
select cron.schedule('cadastre-watch-d', '2 15 * * *', $$select net.http_post(url := 'https://aowceqpaawxeugalapgx.supabase.co/functions/v1/cadastre-watch', headers := jsonb_build_object('Content-Type','application/json','x-cron-key',(select decrypted_secret from vault.decrypted_secrets where name='cron_key')), body := '{"action":"check","cron":true}'::jsonb)$$);
