-- Ověření totožnosti klienta přes Bank iD (funkce bankid-verify). SQL spouští Martin v SQL Editoru.
create table if not exists public.bankid_verifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  token text not null unique,
  state text not null unique,
  nonce text not null,
  status text not null default 'pending' check (status in ('pending','verified','failed')),
  claims jsonb,
  error text,
  requested_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  verified_at timestamptz,
  applied_at timestamptz
);
create index if not exists bankid_verifications_contact on public.bankid_verifications (contact_id, created_at desc);
alter table public.bankid_verifications enable row level security;
drop policy if exists bankid_select on public.bankid_verifications;
create policy bankid_select on public.bankid_verifications for select to authenticated
  using (public.is_admin(account_id));
grant select on public.bankid_verifications to authenticated; -- zápisy jen přes funkci (service role)
