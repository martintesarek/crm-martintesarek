-- Elektronický podpis (zprostředkovatelské a rezervační smlouvy): žádosti o podpis a podepisující.
-- Přístup jen přes edge funkci `sign` (service role), proto RLS bez politik = nikdo jiný se nedostane.
create table if not exists public.sign_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  title text not null,
  source_file_id text,
  folder_id text,
  doc_path text not null,
  doc_sha256 text not null,
  page_count int,
  work_path text,
  work_ver int not null default 0,
  signed_path text,
  drive_url text,
  sms_text text,
  status text not null default 'draft',
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists public.sign_signers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sign_requests(id) on delete cascade,
  name text not null,
  phone text not null,
  token text not null unique,
  placements jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  otp_hash text,
  otp_sent_at timestamptz,
  otp_attempts int not null default 0,
  signed_at timestamptz,
  ip text,
  ua text,
  signature_path text,
  created_at timestamptz not null default now()
);
create index if not exists sign_requests_deal_idx on public.sign_requests(deal_id);
create index if not exists sign_signers_req_idx on public.sign_signers(request_id);
alter table public.sign_requests enable row level security;
alter table public.sign_signers enable row level security;
