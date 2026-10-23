-- Vypínač automatických SMS přání (svátek + narozeniny) u kontaktu. Nasazeno 23. 10. 2026.
alter table public.contacts add column if not exists auto_wishes boolean not null default true;
comment on column public.contacts.auto_wishes is 'Posílat automatická SMS přání k svátku a narozeninám (vypínač u kontaktu)';
