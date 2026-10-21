# CRM Martin Tesárek – paměť projektu

Vlastní CRM realitního makléře Martina Tesárka (Valtice, jižní Morava + Praha), náhrada ClickUpu.
Živě na **https://crm.martintesarek.cz** (PWA, používá hlavně z mobilu). Martin není programátor:
komunikuj česky, jednoduše, bez technického žargonu; ukazuj výsledek, ne postup.
Stavěno multi-tenant (účty/členství), později produkt pro makléře z „Marketing pro makléře“.

## Infrastruktura (bez tajemství – klíče vkládá Martin sám, nikdy je nepiš do chatu ani do repa)
- **Kód:** GitHub `martintesarek/crm-martintesarek` (private, větev `main`). Commity jako
  `-c user.name="Martin Tesárek" -c user.email="reality@martintesarek.cz"`.
- **Hosting:** Vercel, projekt `crm-martintesarek` (scope `martin-tesarek`, id `prj_vdlEPIpmH2pVkeUNgqix5LwfmctT`),
  domény crm.martintesarek.cz + crm-martintesarek.vercel.app. Push na `main` má nasadit automaticky,
  ale **GitHub → Vercel se opakovaně zasekává na „pending“** – po pushi zkontroluj
  `gh api repos/martintesarek/crm-martintesarek/commits/<sha>/status` a když není `success`,
  spusť nasazení ručně (`mcp__Vercel__create_deployment`, gitSource github/main/sha, target production, forceNew 1).
  Aplikace je PWA – po nasazení stačí obnovit stránku.
- **Backend:** Supabase projekt `aowceqpaawxeugalapgx` (Postgres + RLS, Storage, Edge Functions, Auth).
  Auth: Google OAuth + heslo + magic link; Site URL crm.martintesarek.cz.
  Storage buckety: `covers` (public), `files` (privátní – dokumenty `{account}/docs/…`), `voice` (privátní).
  Edge Functions: `voice-note`, `drive-scan`, `doc-generate`, `nameday-sms` (verify_jwt=false, ověřuje cron klíč nebo JWT).
  Secrets (Supabase → Edge Functions → Secrets): `GEMINI_API_KEY`, `GOOGLE_SA_KEY`, `GOSMS_CLIENT_ID`, `GOSMS_CLIENT_SECRET`.
  Nasazení funkcí: `mcp__Supabase__deploy_edge_function` (obsah souborů se vkládá do volání). Lokální test
  přes deno: `npx --prefix <scratch>/denobin deno run -A …` (deno-bin z npm; curl na supabase.co a jiné weby
  je z kontejneru blokovaný proxy – ladit přes MCP/Chrome, ne přes curl).
  pg_cron: joby `nameday-sms-a` (8:17 UTC) a `nameday-sms-b` (9:17 UTC) volají `nameday-sms`
  s hlavičkou `x-cron-key` (klíč je v kódu funkce i v cron jobu); funkce pošle jen když je v Praze 10 h.
- **Google Cloud** projekt `imposing-volt-421216`: Drive API, OAuth klient „CRM crm.martintesarek.cz“,
  servisní účet `crm-disk@imposing-volt-421216.iam.gserviceaccount.com` (klíč = secret GOOGLE_SA_KEY).
  Složka **KLIENTI** (sdílený disk Reality Martin Tesárek, podsložky podle roků 2024, 2025, 2026…, v nich
  `Příjmení Jméno`) je SA nasdílená jako Čtenář. **Pro ukládání dokumentů na Disk musí mít SA roli
  „Správce obsahu“** – dokud to Martin nenastaví, dokumenty se ukládají jen do Supabase Storage.
- **AI:** Gemini `gemini-3.8-flash` (přepis hlasu, čtení dokumentů z Disku; 2.5-flash už není dostupný).
- **GoSMS:** kanál 350324; API OAuth client_credentials (`app.gosms.cz/oauth/v2/token`, `/api/v1/messages/`).
- **Make.com** (org 456966, team 281889): zůstává pro SMS makléřům, akvizice, Zelenou poštu atd.
  Přání klientům k svátku/narozeninám už posílá CRM → ve scénářích `Svátek klienta -> SMS` (1106235)
  a `Narozeniny klienta -> SMS` (1480058) vypnout větve klientů, nechat jen makléře.
- **ClickUp** (workspace 4708412): list Kontakty `150428274`; custom field ids: Datum narození
  `c5703c04-…`, Oslovení `070c38cd-…`, Vykání vs. tykání `490c7830-…`, Telefon `7a597939-…`.
  Export všech 505 kontaktů je v DB tabulce `clickup_contacts_stage` (jméno, narození, oslovení, extra jsonb se všemi poli,
  vykání, telefon, e-mail, status, created_at) – zdroj pro doimport zbylých ~370 kontaktů (čeká na Martinovo ano).

## Stack a kód
Vite 8 + React 19 + TypeScript + Tailwind v4 (tokeny v `src/index.css`, @layer base/utilities), react-router 7,
supabase-js. Build: `npm run build` (tsc + vite). Design: navy `#253371`, zlatá, Montserrat/Plus Jakarta,
mobile-first, karty `rounded-[22px]`.
- `src/pages`: Today (dashboard s widgety), Deals (seznam/nástěnka, drag&drop i na mobilu), DealDetail,
  NewDeal, Contacts (seznam + detail), Settings (Můj účet, Automatizace, Vlastní pole, Fáze, Tým), Login, Portal (klientský portál `/p/:token`).
- `src/components`: DriveCard (Načíst z Disku), DocumentsCard (dokumenty jedním klepnutím), PortalCard,
  VoiceNote (hlasová poznámka, FAB), ui.tsx (Card, Sheet, Btn, Toggle, StagePill, StatusChip/StatusPicker, CONTACT_STATUSES).
- `src/lib`: dashboard.ts (widgety + layout v `profiles.settings.dashboard`), documents.ts (výchozí hodnoty
  dokumentů z CRM), deals.ts (DEAL_SELECT), format.ts, touchDrag.tsx, types.ts.
- Komponenty definované uvnitř jiné komponenty (inline `const F = () => …`) ztrácejí fokus při psaní –
  definuj je na úrovni modulu nebo volej jako funkce `{F({...})}`.
- Čeština: všechny texty v UI česky, kontakty s diakritikou; porovnávání jmen přes `public.unaccent`.

## Databáze (důležité tabulky)
`accounts` (settings jsonb: broker info, `doc_agent`, `nameday_sms`, `birthday_sms`), `memberships`, `profiles`
(settings: `dashboard`, `contacts_columns`), `stages`, `field_defs`, `deals` (+portal_*, drive_scan), `deal_contacts`
(role = jeden ze 4 typů), `contacts` (status, salutation, formality default `vykani`, birth_date, birth_number,
name_day `MM-DD` – plní trigger `contacts_name_day` z tabulky `name_days`), `tasks`, `activities`, `voice_notes`,
`documents`, `sms_log` (unikát kontakt+kind+rok), `portal_events`, `name_days`, `clickup_contacts_stage`.
RLS přes `is_member(account_id)`. DB funkce volané z aplikace musí mít `set search_path = public, extensions`
a případně `security definer` (unaccent je ve schématu extensions; tabulky s RLS jinak vrací prázdno).
MCP `execute_sql` odmítá DELETE/DROP bez potvrzení – mazání dělá Martin v UI, nebo skrývej (`hidden`).

## Pravidla a rozhodnutí Martina (dodržovat)
- **Štítky kontaktů jsou jen čtyři, všude v aplikaci:** Prodávající, Kupující, Lead, Kontakt (dříve „Klient“ – přejmenováno 21. 10. 2026; ClickUp klient i kontakt → Kontakt)
  (`CONTACT_STATUSES`). Žádné spoluprodávající/zájemce/jiný. U kontaktu v obchodu je vidět jen jméno +
  barevný štítek (klepnutím přepnout), bez telefonu. Kontakty z LV (Disk) jsou vždy Prodávající;
  Kontakt/Kupující/Lead nastavuje Martin ručně (v Novém obchodu je výběr s předvolbou Prodávající).
- Nový kontakt vždy **vyká**; tykání jen ručně. Oslovení (pane Nováku) je samostatné pole.
- **Svátek** se doplňuje automaticky podle křestního jména (trigger), jde přepsat ručně („21. 4.“).
- Funkce **„Další krok“ v CRM není** – jen úkoly (hlasová poznámka převádí nejbližší akci na úkol).
- Fáze „Úkol“ je skrytá. Nový obchod: pole jako v ClickUpu v pořadí klient → nemovitost → obchod,
  bez odkazu na Disk (doplní se v detailu).
- Dashboard si Martin skládá sám (zobrazit/skrýt, velikost, pořadí, drag&drop); widget Svátky.
- Seznam kontaktů: mini dashboard (celkem + přírůstek po měsících 1.–poslední den), sekce podle typu
  jako tabulka, sloupce si volí sám (uloženo v profilu).
- **Dokumenty** (ZS, RS, plná moc, předávací protokol): texty 1:1 z Martinových vzorů (skill
  `realitni-dokumenty`), hlavičkový papír `public/templates/hlavickovy-papir.docx`, Montserrat 9 pt,
  spojka „a“ mezi stranami nikdy tučně, chybějící údaje žlutě `[[DOPLNIT: …]]`, místo a datum vždy
  vyplněné (Ve Valticích = jižní Morava, V Praze = jinde), nikdy nezkracovat text kvůli počtu stránek,
  výsledek vždy s odkazem na Disk. Firmy: MARTIN TESÁREK REALITY s.r.o. (Valtice), MARTIN TESAREK REAL
  ESTATE s.r.o., PROFESIONÁLNÍ REALITNÍ MAKLÉŘ s.r.o., Bc. Martin Tesárek (jen RS) – údaje v `content.ts`.
- **SMS**: automatická přání k svátku/narozeninám v 10:17 klientům s telefonem a oslovením, jednou za rok,
  texty v Nastavení → Automatizace. Ručně odesílané SMS: vždy ukázat text a čekat na potvrzení.
- AI nikdy nevytěžuje rodná čísla; nic se do obchodu nezapisuje bez Martinova zaškrtnutí/potvrzení.
- Klíče a hesla vkládá Martin sám (Supabase Secrets, Google Cloud); souhlasy s podmínkami jen na jeho „ano“.

## Co je rozdělané / čeká
- Martin: role „Správce obsahu“ pro crm-disk@ na složce KLIENTI; vložit GOSMS_CLIENT_ID/SECRET a poslat test;
  v Make vypnout větve klientů u svátků/narozenin; rozhodnout doimport ~370 kontaktů z ClickUpu.
- Dále v plánu: Make webhooky / migrace scénářů (SMS o záloze, e-mail o inzerci, zaslání RS/ZS…),
  dokončení importu z ClickUpu (podúkoly, popisy, 23 náhledů, data změn fází), pozvat Barboru,
  smazat nepoužívaný Google OAuth secret (`VJfF`), Gemini billing na prepay (Martin),
  vlastní MCP server pro CRM (náhrada ClickUp MCP), případně štítky pro makléře.
