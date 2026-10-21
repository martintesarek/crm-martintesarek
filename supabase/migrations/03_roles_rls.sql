-- 03: Role v databázi. owner/admin = vše. Ostatní (makléř) = jen svoje obchody a kontakty. Mazat smí jen admin.
alter table public.contacts add column if not exists created_by uuid default auth.uid();
alter table public.tasks alter column assignee_id set default auth.uid();

create or replace function public.can_see_contact(cid uuid, acc uuid, cb uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin(acc) or (public.is_member(acc) and (cb = auth.uid() or exists (
    select 1 from public.deal_contacts dc join public.deals d on d.id = dc.deal_id
    where dc.contact_id = cid and d.assignee_id = auth.uid())))
$$;
revoke all on function public.can_see_contact(uuid,uuid,uuid) from public, anon;
grant execute on function public.can_see_contact(uuid,uuid,uuid) to authenticated, service_role;

create or replace function public.deals_default_assignee() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is null and auth.uid() is not null and not public.is_admin(new.account_id) then new.assignee_id := auth.uid(); end if;
  return new;
end $$;
revoke all on function public.deals_default_assignee() from public, anon, authenticated;
drop trigger if exists deals_default_assignee on public.deals;
create trigger deals_default_assignee before insert on public.deals for each row execute function public.deals_default_assignee();

-- obchody
drop policy if exists "members all deals" on public.deals;
create policy deals_select on public.deals for select to authenticated using (public.is_admin(account_id) or (public.is_member(account_id) and assignee_id = auth.uid()));
create policy deals_insert on public.deals for insert to authenticated with check (public.is_member(account_id));
create policy deals_update on public.deals for update to authenticated using (public.is_admin(account_id) or (public.is_member(account_id) and assignee_id = auth.uid())) with check (public.is_member(account_id));
create policy deals_delete on public.deals for delete to authenticated using (public.is_admin(account_id));

-- kontakty
drop policy if exists "members all contacts" on public.contacts;
create policy contacts_select on public.contacts for select to authenticated using (public.can_see_contact(id, account_id, created_by));
create policy contacts_insert on public.contacts for insert to authenticated with check (public.is_member(account_id));
create policy contacts_update on public.contacts for update to authenticated using (public.can_see_contact(id, account_id, created_by)) with check (public.is_member(account_id));
create policy contacts_delete on public.contacts for delete to authenticated using (public.is_admin(account_id));

-- tabulky vázané na obchod: vidím jen když vidím obchod
do $$ declare t text; begin
  foreach t in array array['documents','attachments','portal_events','deal_contacts'] loop
    execute format('drop policy if exists %I on public.%I', (case t when 'documents' then 'documents_member' when 'attachments' then 'members all attachments' when 'portal_events' then 'portal_events_member' else 'members all deal_contacts' end), t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_admin(account_id) or (public.is_member(account_id) and exists (select 1 from public.deals d where d.id = %1$s.deal_id)))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.is_member(account_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.is_admin(account_id) or (public.is_member(account_id) and exists (select 1 from public.deals d where d.id = %1$s.deal_id))) with check (public.is_member(account_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.is_admin(account_id))', t);
  end loop;
end $$;

-- úkoly
drop policy if exists "members all tasks" on public.tasks;
create policy tasks_all on public.tasks for all to authenticated
  using (public.is_admin(account_id) or (public.is_member(account_id) and ((deal_id is null and assignee_id = auth.uid()) or (deal_id is not null and exists (select 1 from public.deals d where d.id = tasks.deal_id)))))
  with check (public.is_member(account_id));
-- aktivity
drop policy if exists "members all activities" on public.activities;
create policy activities_all on public.activities for all to authenticated
  using (public.is_admin(account_id) or (public.is_member(account_id) and ((deal_id is not null and exists (select 1 from public.deals d where d.id = activities.deal_id)) or (contact_id is not null and exists (select 1 from public.contacts c where c.id = activities.contact_id)))))
  with check (public.is_member(account_id));
-- hlasové poznámky
drop policy if exists voice_notes_member on public.voice_notes;
create policy voice_notes_all on public.voice_notes for all to authenticated
  using (public.is_admin(account_id) or (public.is_member(account_id) and (user_id = auth.uid() or (deal_id is not null and exists (select 1 from public.deals d where d.id = voice_notes.deal_id)))))
  with check (public.is_member(account_id));
-- SMS
drop policy if exists sms_log_member on public.sms_log;
create policy sms_log_select on public.sms_log for select to authenticated using (public.is_admin(account_id) or (public.is_member(account_id) and exists (select 1 from public.contacts c where c.id = sms_log.contact_id)));
-- historie fází, asistent
drop policy if exists "members read stage_history" on public.stage_history;
create policy stage_history_select on public.stage_history for select to authenticated using (public.is_admin(account_id) or (public.is_member(account_id) and exists (select 1 from public.deals d where d.id = stage_history.deal_id)));
drop policy if exists member on public.assistant_calls;
create policy assistant_calls_all on public.assistant_calls for all to authenticated using (public.is_admin(account_id) or user_id = auth.uid()) with check (public.is_member(account_id));
-- automatizace: číst smí člen, měnit jen admin
drop policy if exists automations_member on public.automations;
create policy automations_select on public.automations for select to authenticated using (public.is_member(account_id));
create policy automations_write on public.automations for all to authenticated using (public.is_admin(account_id)) with check (public.is_admin(account_id));
drop policy if exists automation_runs_member on public.automation_runs;
create policy automation_runs_select on public.automation_runs for select to authenticated using (public.is_admin(account_id) or user_id = auth.uid());
