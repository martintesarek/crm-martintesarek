-- Úkol může být i ke klientovi (kontaktu), nejen k obchodu. SQL spouští Martin v SQL Editoru.
alter table public.tasks add column if not exists contact_id uuid references public.contacts(id) on delete cascade;
create index if not exists tasks_contact on public.tasks (contact_id) where contact_id is not null;
drop policy if exists tasks_all on public.tasks;
create policy tasks_all on public.tasks for all to authenticated
  using (public.is_admin(account_id) or (public.is_member(account_id) and (
    (deal_id is null and contact_id is null and assignee_id = auth.uid())
    or (deal_id is not null and exists (select 1 from public.deals d where d.id = tasks.deal_id))
    or (contact_id is not null and exists (select 1 from public.contacts c where c.id = tasks.contact_id)))));
