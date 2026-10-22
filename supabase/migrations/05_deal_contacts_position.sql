-- Pořadí kontaktů v obchodu; první = hlavní kontakt (telefon, SMS, e-mail)
alter table public.deal_contacts add column if not exists position double precision not null default 0;
alter table public.deal_contacts alter column position set default extract(epoch from now());
