-- Ocenění přes Valuo: výsledek u obchodu + zobrazení v klientském portálu (jen když ho makléř klientovi ukáže)
alter table public.deals add column if not exists valuo jsonb;

create or replace function public.portal_get(p_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    'valuo', case when (d.valuo->>'shared')::boolean is not false then d.valuo - 'shared' end,
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
