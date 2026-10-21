-- 01: Auditní log (kdo, kdy, co) – záznamy nelze měnit ani mazat
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  account_id uuid, user_id uuid,
  action text not null, table_name text, record_id text, detail jsonb
);
create index if not exists audit_log_at on public.audit_log(at desc);
create index if not exists audit_log_acc_at on public.audit_log(account_id, at desc);
alter table public.audit_log enable row level security;
drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log for select to authenticated using (account_id is not null and public.is_admin(account_id));
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;

create or replace function public.audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'Auditní záznam nelze měnit ani mazat.'; end $$;
drop trigger if exists audit_log_immutable on public.audit_log;
create trigger audit_log_immutable before update or delete on public.audit_log for each row execute function public.audit_immutable();

create or replace function public.log_access(p_action text, p_table text default null, p_record text default null, p_detail jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare acc uuid;
begin
  select account_id into acc from public.memberships where user_id = auth.uid() limit 1;
  if acc is null then return; end if;
  insert into public.audit_log(account_id, user_id, action, table_name, record_id, detail) values (acc, auth.uid(), left(p_action,60), left(p_table,60), left(p_record,80), p_detail);
end $$;
revoke all on function public.log_access(text,text,text,jsonb) from public, anon;
grant execute on function public.log_access(text,text,text,jsonb) to authenticated, service_role;

-- změny záznamů (ukládají se jen názvy změněných polí, ne osobní údaje)
create or replace function public.audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare j jsonb; o jsonb; chg text[];
begin
  if tg_op = 'DELETE' then
    j := to_jsonb(old);
    insert into public.audit_log(account_id,user_id,action,table_name,record_id) values ((j->>'account_id')::uuid, auth.uid(), 'delete', tg_table_name, coalesce(j->>'id', j->>'deal_id'));
    return old;
  elsif tg_op = 'INSERT' then
    j := to_jsonb(new);
    insert into public.audit_log(account_id,user_id,action,table_name,record_id) values ((j->>'account_id')::uuid, auth.uid(), 'insert', tg_table_name, coalesce(j->>'id', j->>'deal_id'));
    return new;
  else
    j := to_jsonb(new); o := to_jsonb(old);
    select array_agg(e.k) into chg from jsonb_each(j) as e(k,v)
      where e.v is distinct from o->e.k and e.k not in ('updated_at','portal_viewed_at','portal_view_count','position','stage_changed_at');
    if chg is not null then
      insert into public.audit_log(account_id,user_id,action,table_name,record_id,detail) values ((j->>'account_id')::uuid, auth.uid(), 'update', tg_table_name, coalesce(j->>'id', j->>'deal_id'), jsonb_build_object('fields', to_jsonb(chg)));
    end if;
    return new;
  end if;
end $$;
revoke all on function public.audit_row() from public, anon, authenticated;
do $$ declare t text; begin
  foreach t in array array['contacts','deals','documents','deal_contacts','memberships','invites','accounts','automations'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit_row()', t);
  end loop;
end $$;
