-- Datum narození a pohlaví se doplní automaticky z rodného čísla, když chybí.
create or replace function public.bn_birth_date(bn text) returns date
language plpgsql immutable set search_path = public as $$
declare d text := regexp_replace(coalesce(bn, ''), '\D', '', 'g'); yy int; mm int; dd int; yyyy int;
begin
  if length(d) not in (9, 10) then return null; end if;
  yy := substr(d, 1, 2)::int; mm := substr(d, 3, 2)::int; dd := substr(d, 5, 2)::int;
  if length(d) = 9 then
    if yy > 53 then return null; end if;
    yyyy := 1900 + yy;
  else
    yyyy := case when yy >= 54 then 1900 + yy else 2000 + yy end;
  end if;
  if mm > 70 then mm := mm - 70; elsif mm > 50 then mm := mm - 50; elsif mm > 20 then mm := mm - 20; end if;
  begin return make_date(yyyy, mm, dd); exception when others then return null; end;
end $$;

create or replace function public.contacts_bn_derive() returns trigger
language plpgsql set search_path = public, extensions as $$
declare dt date; d text; m int;
begin
  if new.birth_number is not null and new.birth_number not like 'enc:%' then
    d := regexp_replace(new.birth_number, '\D', '', 'g');
    dt := public.bn_birth_date(d);
    if dt is not null then
      if new.birth_date is null then new.birth_date := dt; end if;
      if new.gender is null then
        m := substr(d, 3, 2)::int;
        new.gender := case when (m between 51 and 62) or m >= 71 then 'žena' else 'muž' end;
      end if;
    end if;
  end if;
  return new;
end $$;

-- název začíná „a“, aby běžel dřív než šifrování rodného čísla (contacts_encrypt_bn)
drop trigger if exists contacts_a_bn_derive on public.contacts;
create trigger contacts_a_bn_derive before insert or update of birth_number on public.contacts
for each row execute function public.contacts_bn_derive();
