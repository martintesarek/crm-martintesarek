-- Kontrola sankčního seznamu EU (funkce sanctions-check). SQL spouští Martin v SQL Editoru.
create table if not exists public.sanctions_entries (
  entity_id text not null,
  name text not null,
  name_norm text not null,
  tokens text[] not null,
  kind text,
  programme text,
  births text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (entity_id, name_norm)
);
create index if not exists sanctions_entries_tokens on public.sanctions_entries using gin (tokens);
alter table public.sanctions_entries enable row level security; -- bez politik: čte jen funkce (service role)

create table if not exists public.sanctions_meta (
  id int primary key default 1 check (id = 1),
  refreshed_at timestamptz,
  entries int,
  error text
);
alter table public.sanctions_meta enable row level security;
drop policy if exists sanctions_meta_select on public.sanctions_meta;
create policy sanctions_meta_select on public.sanctions_meta for select to authenticated using (true);
grant select on public.sanctions_meta to authenticated;

-- výsledek poslední kontroly u kontaktu: {status:'clear'|'possible', checked_at, matches:[{name,kind,programme,strong}], list_at}
alter table public.contacts add column if not exists sanctions jsonb;

-- Denně v 5:11 UTC se seznam obnoví a přezkoumají se kontakty.
select cron.unschedule('sanctions-refresh') where exists (select 1 from cron.job where jobname = 'sanctions-refresh');
select cron.schedule('sanctions-refresh', '11 5 * * *', $$select net.http_post(url := 'https://aowceqpaawxeugalapgx.supabase.co/functions/v1/sanctions-check', headers := jsonb_build_object('Content-Type','application/json','x-cron-key',(select decrypted_secret from vault.decrypted_secrets where name='cron_key')), body := '{"action":"refresh"}'::jsonb)$$);
