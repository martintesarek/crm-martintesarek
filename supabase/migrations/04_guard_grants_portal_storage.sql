-- 04: Hlídání nadměrného čtení, oprávnění, portál, úložiště, profil, GDPR funkce
-- ---- hlídání hromadného stahování (kontrola každého požadavku na API) ----
create unlogged table if not exists public.api_hits (at timestamptz not null default now(), uid uuid not null, path text not null);
create index if not exists api_hits_idx on public.api_hits(uid, at);
alter table public.api_hits enable row level security;
revoke all on public.api_hits from anon, authenticated;
grant all on public.api_hits to service_role;

create or replace function public.api_guard() returns void language plpgsql security definer set search_path = public as $$
declare uid uuid; p text; n int; acc uuid; blocked boolean := false;
begin
  begin
    p := current_setting('request.path', true);
    uid := nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid;
    if uid is null or p is null or p !~ '^/(contacts|deals|documents|deal_contacts|activities|sms_log)' then return; end if;
    insert into public.api_hits(uid, path) values (uid, p);
    if random() < 0.02 then delete from public.api_hits where at < now() - interval '3 hours'; end if;
    select count(*) into n from public.api_hits where uid = api_guard.uid and at > now() - interval '1 hour';
    if n > 300 then
      blocked := true;
      select account_id into acc from public.memberships where user_id = uid limit 1;
      if not exists (select 1 from public.audit_log where user_id = uid and action = 'alert_bulk_read' and at > now() - interval '1 hour') then
        insert into public.audit_log(account_id, user_id, action, detail) values (acc, uid, 'alert_bulk_read', jsonb_build_object('requests_last_hour', n));
      end if;
    end if;
  exception when others then
    return;  -- hlídač nikdy nesmí shodit aplikaci
  end;
  if blocked then raise exception 'Příliš mnoho požadavků, zkuste to později.' using errcode = 'PT429'; end if;
end $$;
grant execute on function public.api_guard() to anon, authenticated, service_role;
alter role authenticator set pgrst.db_pre_request = 'public.api_guard';
notify pgrst, 'reload config';

-- ---- portál: jen údaje makléře, ne celé nastavení účtu ----
do $$ declare def text; begin
  select pg_get_functiondef('public.portal_get(text)'::regprocedure) into def;
  def := replace(def, '''broker'', acc.settings,', '''broker'', jsonb_build_object(''broker_name'', acc.settings->''broker_name'', ''broker_title'', acc.settings->''broker_title'', ''broker_phone'', acc.settings->''broker_phone'', ''broker_email'', acc.settings->''broker_email'', ''website'', acc.settings->''website''),');
  execute def;
end $$;

-- ---- profil: e-mail nejde měnit z aplikace ----
create or replace function public.profiles_lock_email() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.email is distinct from old.email then new.email := old.email; end if;
  return new;
end $$;
revoke all on function public.profiles_lock_email() from public, anon, authenticated;
drop trigger if exists profiles_lock_email on public.profiles;
create trigger profiles_lock_email before update on public.profiles for each row execute function public.profiles_lock_email();

-- ---- úložiště: limity a povolené typy, veřejné výpisy pryč ----
update storage.buckets set file_size_limit = 26214400,
  allowed_mime_types = array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png','image/webp','text/plain'] where id = 'files';
update storage.buckets set file_size_limit = 26214400,
  allowed_mime_types = array['audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/wav','audio/x-m4a','audio/aac','video/webm','video/mp4'] where id = 'voice';
update storage.buckets set file_size_limit = 10485760, allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'] where id = 'covers';
drop policy if exists "public read covers" on storage.objects;

-- ---- oprávnění ----
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
revoke execute on function public.contacts_set_name_day() from public, anon, authenticated;
revoke execute on function public.name_day_for(text) from public, anon, authenticated;
revoke execute on function public.cu_norm(text) from public, anon;
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_member(uuid), public.is_admin(uuid) to authenticated, service_role;
grant execute on function public.portal_get(text) to anon, authenticated, service_role;

-- ---- GDPR a rodná čísla ----
create or replace function public.reveal_birth_number(p_contact uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare c record; k text; v text;
begin
  select id, account_id, created_by, birth_number into c from public.contacts where id = p_contact;
  if not found or not public.can_see_contact(c.id, c.account_id, c.created_by) then return null; end if;
  if c.birth_number is null then return null; end if;
  perform public.log_access('reveal_birth_number', 'contacts', p_contact::text);
  if c.birth_number not like 'enc:%' then return c.birth_number; end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'birth_number_key';
  v := extensions.pgp_sym_decrypt(decode(substr(c.birth_number, 5), 'base64'), k);
  return v;
end $$;
revoke all on function public.reveal_birth_number(uuid) from public, anon;
grant execute on function public.reveal_birth_number(uuid) to authenticated;

create or replace function public.gdpr_export_contact(p_contact uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.contacts; r jsonb;
begin
  select * into c from public.contacts where id = p_contact;
  if not found or not public.is_admin(c.account_id) then raise exception 'Nedostatečná oprávnění.'; end if;
  perform public.log_access('gdpr_export', 'contacts', p_contact::text);
  r := jsonb_build_object(
    'kontakt', to_jsonb(c) - 'birth_number',
    'obchody', coalesce((select jsonb_agg(jsonb_build_object('obchod', d.title, 'role', dc.role)) from public.deal_contacts dc join public.deals d on d.id = dc.deal_id where dc.contact_id = c.id), '[]'),
    'sms', coalesce((select jsonb_agg(to_jsonb(s) - 'account_id') from public.sms_log s where s.contact_id = c.id), '[]'),
    'aktivity', coalesce((select jsonb_agg(to_jsonb(a) - 'account_id') from public.activities a where a.contact_id = c.id), '[]'));
  return r;
end $$;
revoke all on function public.gdpr_export_contact(uuid) from public, anon;
grant execute on function public.gdpr_export_contact(uuid) to authenticated;

create or replace function public.gdpr_erase_contact(p_contact uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.contacts;
begin
  select * into c from public.contacts where id = p_contact;
  if not found or not public.is_admin(c.account_id) then raise exception 'Nedostatečná oprávnění.'; end if;
  perform public.log_access('gdpr_erase', 'contacts', p_contact::text);
  delete from public.sms_log where contact_id = p_contact;
  delete from public.activities where contact_id = p_contact;
  delete from public.deal_contacts where contact_id = p_contact;
  delete from public.contacts where id = p_contact;
end $$;
revoke all on function public.gdpr_erase_contact(uuid) from public, anon;
grant execute on function public.gdpr_erase_contact(uuid) to authenticated;
