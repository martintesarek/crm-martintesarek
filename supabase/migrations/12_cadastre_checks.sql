-- Historie kontrol hlídače katastru (každá kontrola = jeden řádek)
create table if not exists public.cadastre_checks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  watch_id uuid not null references public.cadastre_watch(id) on delete cascade,
  at timestamptz not null default now(),
  result text not null check (result in ('ok','change','baseline','error')),
  message text
);
create index if not exists cadastre_checks_watch_at on public.cadastre_checks (watch_id, at desc);
alter table public.cadastre_checks enable row level security;
drop policy if exists cadastre_checks_all on public.cadastre_checks;
create policy cadastre_checks_all on public.cadastre_checks for all to authenticated
  using (public.is_member(account_id)) with check (public.is_member(account_id));
grant select, insert, update, delete on public.cadastre_checks to authenticated;
