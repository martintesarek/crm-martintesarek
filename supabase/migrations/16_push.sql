-- Push upozornění (odpovědi na SMS, Hlídač katastru, úkoly na dnes). Nasazeno 23. 10. 2026 (SQL spouští Martin v SQL Editoru).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  prefs jsonb not null default '{"replies":true,"cadastre":true,"tasks":true}',
  ua text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subs_own on public.push_subscriptions;
create policy push_subs_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(account_id));
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create table if not exists public.push_config (key text primary key, value text not null);
alter table public.push_config enable row level security; -- bez pravidel: čte jen funkce (service role); VAPID klíče si funkce vytvoří sama

create table if not exists public.push_sent (key text primary key, at timestamptz not null default now());
alter table public.push_sent enable row level security;

alter table public.sms_replies add column if not exists notified_at timestamptz;
alter table public.cadastre_changes add column if not exists notified_at timestamptz;
update public.sms_replies set notified_at = now() where notified_at is null;
update public.cadastre_changes set notified_at = now() where notified_at is null;

select cron.unschedule('push-scan') where exists (select 1 from cron.job where jobname = 'push-scan');
select cron.schedule('push-scan', '* * * * *', $$select net.http_post(url := 'https://aowceqpaawxeugalapgx.supabase.co/functions/v1/push-notify', headers := jsonb_build_object('Content-Type','application/json','x-cron-key',(select decrypted_secret from vault.decrypted_secrets where name='cron_key')), body := '{}'::jsonb)$$);
