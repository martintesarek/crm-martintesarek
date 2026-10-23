-- Zelená pošta: evidence odeslaných dopisů z CRM (cena pro měsíční fakturaci, stav, odkaz na obchod/kontakt).
-- Přístup jen přes edge funkci `zelena-posta` (service role) – RLS bez politik.
create table if not exists public.zp_mailings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  title text not null,
  file_name text,
  recipient jsonb not null,
  product text,
  price numeric,
  status text not null default 'sent',
  error text,
  response jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists zp_mailings_deal_idx on public.zp_mailings(deal_id);
create index if not exists zp_mailings_contact_idx on public.zp_mailings(contact_id);
alter table public.zp_mailings enable row level security;
