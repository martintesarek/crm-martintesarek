-- Hlídač katastru: frekvence kontroly u každé nemovitosti a příznak „moje nemovitost“.
alter table public.cadastre_watch add column if not exists frequency text not null default 'twice' check (frequency in ('twice', 'daily', 'weekly', 'monthly'));
alter table public.cadastre_watch add column if not exists is_mine boolean not null default false;
