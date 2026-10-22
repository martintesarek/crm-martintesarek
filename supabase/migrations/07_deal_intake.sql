-- Náběrový formulář: data z náběrové schůzky (byt / dům / pozemek) uložená u obchodu.
-- intake = { "type": "dum" | "byt" | "pozemek", "values": { ... } }
alter table public.deals add column if not exists intake jsonb not null default '{}'::jsonb;
