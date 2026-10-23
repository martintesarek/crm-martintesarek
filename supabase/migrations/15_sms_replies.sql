-- Odpovědi klientů na SMS (GoSMS webhook → funkce sms-reply). Nasazeno 23. 10. 2026.
create table if not exists public.sms_replies (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  sms_log_id uuid references public.sms_log(id) on delete set null,
  phone text,
  message text not null,
  received_at timestamptz not null default now(),
  provider_id text unique,
  seen boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists sms_replies_contact on public.sms_replies (contact_id, received_at desc);
create index if not exists sms_replies_unseen on public.sms_replies (account_id) where seen = false;
alter table public.sms_replies enable row level security;
drop policy if exists sms_replies_select on public.sms_replies;
create policy sms_replies_select on public.sms_replies for select to authenticated
  using (public.is_admin(account_id) or (public.is_member(account_id) and contact_id is not null and exists (select 1 from public.contacts c where c.id = sms_replies.contact_id)));
drop policy if exists sms_replies_update on public.sms_replies;
create policy sms_replies_update on public.sms_replies for update to authenticated
  using (public.is_admin(account_id) or (public.is_member(account_id) and contact_id is not null and exists (select 1 from public.contacts c where c.id = sms_replies.contact_id)))
  with check (public.is_member(account_id));
grant select, update on public.sms_replies to authenticated;
