-- Oprávnění pro Hlídač katastru (bez nich CRM seznam nevidí).
grant select, insert, update, delete on public.cadastre_watch to authenticated;
grant select, insert, update, delete on public.cadastre_changes to authenticated;
