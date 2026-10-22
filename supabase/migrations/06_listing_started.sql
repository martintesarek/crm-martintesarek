-- Datum prvního posunu do fáze Inzerce = začátek prodeje; klient v portálu vidí, kolik dní se nemovitost prodává
alter table public.deals add column if not exists listing_started_at timestamptz;

create or replace function public.log_stage_change() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare k text; sname text;
begin
  if tg_op = 'UPDATE' and new.stage_id is distinct from old.stage_id then
    new.stage_changed_at = now();
    select kind, name into k, sname from public.stages where id = new.stage_id;
    if k in ('won','lost') then new.closed_at = coalesce(new.closed_at, now()); else new.closed_at = null; end if;
    if sname = 'Inzerce' and new.listing_started_at is null then new.listing_started_at = now(); end if;
    insert into public.stage_history(account_id, deal_id, from_stage, to_stage, changed_by)
      values (new.account_id, new.id, old.stage_id, new.stage_id, auth.uid());
    insert into public.activities(account_id, deal_id, type, data, author_id)
      values (new.account_id, new.id, 'stage_change', jsonb_build_object('from', old.stage_id, 'to', new.stage_id), auth.uid());
  end if;
  return new;
end; $function$;

-- doplnění z historie fází (první posun do Inzerce), jinak aktuální Inzerce
update public.deals d set listing_started_at = h.first_at
from (select sh.deal_id, min(sh.changed_at) first_at from public.stage_history sh join public.stages s on s.id = sh.to_stage and s.name = 'Inzerce' group by 1) h
where h.deal_id = d.id and d.listing_started_at is null;
update public.deals d set listing_started_at = d.stage_changed_at
from public.stages s where s.id = d.stage_id and s.name = 'Inzerce' and d.listing_started_at is null;

-- portál: začátek prodeje + konec (až když je obchod uzavřen) a hlavní kontakt podle pořadí
create or replace function public.portal_get(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  d public.deals%rowtype; st public.stages%rowtype; acc public.accounts%rowtype;
  c record; show jsonb; res jsonb;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select * into d from public.deals where portal_token = p_token and portal_enabled = true;
  if not found then return null; end if;
  select * into st from public.stages where id = d.stage_id;
  select * into acc from public.accounts where id = d.account_id;
  select ct.first_name, ct.last_name, ct.salutation into c
    from public.deal_contacts dc join public.contacts ct on ct.id = dc.contact_id
    where dc.deal_id = d.id order by dc.position, (dc.role = 'prodávající') desc limit 1;
  show := coalesce(d.portal_show_prices, '{}'::jsonb);

  update public.deals set portal_viewed_at = now(), portal_view_count = portal_view_count + 1 where id = d.id;

  res := jsonb_build_object(
    'title', d.title,
    'category', d.category,
    'address', d.address,
    'cover_url', d.cover_url,
    'step', coalesce(d.portal_step_override, st.portal_step, 1),
    'finished', st.kind = 'won',
    'eta', d.portal_eta,
    'note', d.portal_note,
    'links', d.portal_links,
    'stats', d.portal_stats,
    'client', case when c is null then null else trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) end,
    'broker', jsonb_build_object('broker_name', acc.settings->'broker_name', 'broker_title', acc.settings->'broker_title', 'broker_phone', acc.settings->'broker_phone', 'broker_email', acc.settings->'broker_email', 'website', acc.settings->'website'),
    'estimate', case when (show->>'estimate')::boolean is not false and (d.estimate_low is not null or d.estimate_high is not null)
      then jsonb_build_object('low', d.estimate_low, 'high', d.estimate_high, 'date', d.estimate_date) end,
    'listing', case when (show->>'listing')::boolean is not false then d.listing_price end,
    'offer', case when (show->>'offer')::boolean is not false and d.top_offer is not null
      then jsonb_build_object('amount', d.top_offer, 'date', d.top_offer_date) end,
    'selling_since', d.listing_started_at,
    'selling_until', case when st.kind in ('won','lost') then d.closed_at end,
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'title', e.title, 'note', e.note) order by e.at desc)
      from (select * from public.portal_events where deal_id = d.id order by at desc limit 12) e), '[]'::jsonb)
  );
  return res;
end;
$function$;
