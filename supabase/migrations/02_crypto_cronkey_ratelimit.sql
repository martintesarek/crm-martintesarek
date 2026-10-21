-- 02: Šifrování rodných čísel, tajný klíč pro cron, omezení počtu volání funkcí
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'birth_number_key') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'), 'birth_number_key', 'Klíč pro šifrování rodných čísel');
  end if;
  if not exists (select 1 from vault.secrets where name = 'cron_key') then
    perform vault.create_secret(encode(gen_random_bytes(24),'hex'), 'cron_key', 'Klíč pro cron volání funkcí');
  end if;
end $$;

create or replace function public.enc_bn(t text) returns text language plpgsql security definer set search_path = public, extensions as $$
declare k text;
begin
  if t is null or btrim(t) = '' then return null; end if;
  if t like 'enc:%' then return t; end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'birth_number_key';
  return 'enc:' || encode(extensions.pgp_sym_encrypt(btrim(t), k), 'base64');
end $$;
revoke all on function public.enc_bn(text) from public, anon, authenticated;

create or replace function public.contacts_encrypt_bn() returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.birth_number is not null then new.birth_number := public.enc_bn(new.birth_number); end if;
  return new;
end $$;
revoke all on function public.contacts_encrypt_bn() from public, anon, authenticated;
drop trigger if exists contacts_encrypt_bn on public.contacts;
create trigger contacts_encrypt_bn before insert or update of birth_number on public.contacts for each row execute function public.contacts_encrypt_bn();
-- zašifrovat stávající (3 záznamy)
update public.contacts set birth_number = birth_number where birth_number is not null and birth_number not like 'enc:%';

create or replace function public.get_cron_key() returns text language sql security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'cron_key'
$$;
revoke all on function public.get_cron_key() from public, anon, authenticated;
grant execute on function public.get_cron_key() to service_role;

-- cron joby: klíč se čte z trezoru, už není v textu
select cron.alter_job(1, command := $c$select net.http_post(url := 'https://aowceqpaawxeugalapgx.supabase.co/functions/v1/nameday-sms', headers := jsonb_build_object('Content-Type','application/json','x-cron-key',(select decrypted_secret from vault.decrypted_secrets where name='cron_key')), body := '{}'::jsonb)$c$);
select cron.alter_job(2, command := $c$select net.http_post(url := 'https://aowceqpaawxeugalapgx.supabase.co/functions/v1/nameday-sms', headers := jsonb_build_object('Content-Type','application/json','x-cron-key',(select decrypted_secret from vault.decrypted_secrets where name='cron_key')), body := '{}'::jsonb)$c$);

create unlogged table if not exists public.rate_hits (at timestamptz not null default now(), uid text not null, bucket text not null);
create index if not exists rate_hits_idx on public.rate_hits(uid, bucket, at);
alter table public.rate_hits enable row level security;
revoke all on public.rate_hits from anon, authenticated;
grant all on public.rate_hits to service_role;
create or replace function public.rate_check(p_uid text, p_bucket text, p_max int, p_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.rate_hits where at < now() - interval '2 hours';
  select count(*) into n from public.rate_hits where uid = p_uid and bucket = p_bucket and at > now() - make_interval(secs => p_seconds);
  if n >= p_max then return false; end if;
  insert into public.rate_hits(uid, bucket) values (p_uid, p_bucket);
  return true;
end $$;
revoke all on function public.rate_check(text,text,int,int) from public, anon, authenticated;
grant execute on function public.rate_check(text,text,int,int) to service_role;
