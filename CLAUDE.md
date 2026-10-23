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
  vykání, telefon, e-mail, status, created_at). **Import kontaktů dokončen 21. 10. 2026** (94 doplněno, 406 nových,
  4 testovací „Zkouška“ vynechány; adresa, pohlaví, zdroj, ClickUp štítky → `contacts.tags`, popis → notes, vlastní pole →
  `contacts.custom`, 3 rodná čísla z popisů → birth_number). Porovnání jmen funkcí `public.cu_norm(text)`.

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
- **SMS**: automatická přání k svátku/narozeninám v 10:17 klientům s telefonem a oslovením, jednou za rok; u kontaktu jeden společný vypínač „Automatická přání SMS“ (`contacts.auto_wishes`, migrace 14, 23. 10. 2026),
  texty v Nastavení → Automatizace. Ručně odesílané SMS: vždy ukázat text a čekat na potvrzení.
- **Rodná čísla (od 22. 10. 2026 změněno Martinem):** `lv-extract` z LV vytěží i rodné číslo vlastníků (ověří tvar a kontrolní součet), odvodí datum narození a pohlaví a po zaškrtnutí je uloží do kontaktu (RČ zašifrovaně); u stávajících kontaktů se doplní jen prázdná pole. Cíl: mít u všech kontaktů datum narození pro narozeninové SMS. Nic se nezapisuje bez Martinova zaškrtnutí/potvrzení.
- **Odkaz na CRM (crm.martintesarek.cz) nikdy neposílat ani neuvádět v e-mailech, SMS ani zprávách pro třetí osoby bez Martinova výslovného svolení** (pravidlo 23. 10. 2026; stalo se omylem v e-mailu na Diotimu). Platí i pro návrhy textů – o CRM se v nich zmiňuje jen obecně („vlastní systém“).
- Klíče a hesla vkládá Martin sám (Supabase Secrets, Google Cloud); souhlasy s podmínkami jen na jeho „ano“.

## Bezpečnost (od 22. 10. 2026)
- Měsíční audit podle `SECURITY.md` (naplánovaný úkol, 1. v měsíci). Audit nic nemění, opravy jen po Martinově „ano“.
- Hlavičky webu (CSP, HSTS…) jsou ve `vercel.json`; při přidání nového externího serveru (obrázky, API, fonty) je nutné doplnit CSP.
- 2FA (`components/Mfa.tsx`), odhlášení po 4 h neaktivity (`lib/app.tsx`), rodná čísla se v DB ukládají zašifrovaně (`enc:`), zobrazují se na klepnutí přes `reveal_birth_number` (`lib/secure.ts`).
- Migrace `supabase/migrations/01–04` (audit log, šifrování, role makléř, hlídání čtení 1200 požadavků/h, GDPR funkce) jsou **nasazené 22. 10. 2026** (Martin je spustil v SQL Editoru; zápisy do DB přes MCP blokuje auto-mode, SQL se vkládá do editoru a Martin dá Run). `clickup_contacts_stage` a pole titul/zarazeni/provereni_registru smazány.
- Nasazené funkce s CORS jen pro crm.martintesarek.cz a `rl()`: nameday-sms (cron klíč z trezoru `get_cron_key`, ověřeno), automation-run, live-token, openai-realtime-token. **Nenasazené (v repu upravené, na serveru starší verze):** drive-folder, drive-scan, voice-note, doc-generate – kvůli velikosti a riziku překlepu při ručním vkládání; nasadit přes Supabase CLI.
- Ručně u Martina (Supabase → Authentication): kontrola uniklých hesel, vypnout veřejnou registraci, povinné 2FA.

## Co je rozdělané / čeká
- **Náběrový formulář (22. 10. 2026, nasazeno):** v detailu obchodu karta „Náběrový formulář“ → `/obchody/:id/nabor` (`src/pages/Intake.tsx`, otázky v `src/lib/intake.ts`). Typ byt/dům/pozemek (předvolí se z kategorie obchodu), data v `deals.intake` (`{type, values}`, migrace 07), průběžné ukládání; cena → `listing_price`, adresa/kategorie se doplní jen když chybí. Rozhodnutí Martina: platnost inzerátu při exportu vždy 360 dnů (nezobrazovat), žádné „Smlouva od/do“, žádné vlastnictví státní/obecní, předvolby zapnuté: S provizí RK, Včetně právního servisu, hypotéka, exkluzivní smlouva, adresa „Přesně“; bez polí břemeno / investiční / krátkodobý pronájem. Návrhy obrazovek: Claude Design „Náběrový formulář – návrh“. Zbývá: export na Sreality (XML-RPC import.sreality.cz; čeká se na testovací účet a klíč – Martin píše na info@sreality.cz), reality.idnes.cz (formát zjistit), Bazoš (bez API), nahrání fotek a PENB, návrh popisu inzerátu, Souhrn pro export.
- **Ocenění přes Valuo (22. 10. 2026, nasazeno):** v detailu obchodu → Automatizace řádek „Ocenit nemovitost přes Valuo“ (`components/ValuoSheet.tsx`) → edge funkce `valuo-estimate` (secret `VALUO_API_KEY`, vkládá Martin; volá `v2p.api.valuo.cz/market-value`, mapování z náboru jako v projektu odhad123.cz, 3 pokusy při 5xx). Před voláním se kontroluje, co chybí (`valuoMissing` v `ValuoView.tsx`) – prázdná data se neposílají, Martin se vždy zastaví a dostane seznam k doplnění. Výsledek `{avg,max,perM2,at,index,yoy,type}` (min se nezobrazuje, rozhodnutí Martina) je v `deals.valuo` (migrace 13) a v `intake.values.valuo`; v kartě Ceny zelený řádek s logem (`ValuoPriceRow`). Klientovi se karta (`ValuoCardView`, barvy Valuo `#00D37F`, logo `public/valuo-logo.png`) ukáže v portálu jen po klepnutí „Ukázat klientovi“ (`valuo.shared`, `portal_get` vrací klíč `valuo`). Graf = vývoj ceny nemovitosti od 2020 (čtvrtletní řada z Valuo), pásmo nad průměrem dopočtené podle dnešního poměru max/avg. Nadpis grafu podle typu (bytu/domu/pozemku). Sekce Obchody se v menu jmenuje „Nemovitosti“ (adresy zůstávají `/obchody`).
- **Vyplnění zprostředkovatelské smlouvy (22. 10. 2026, nasazeno):** v detailu obchodu → Automatizace řádek „Vyplnit zprostředkovatelskou smlouvu“ (`components/ZsSheet.tsx`) → edge funkce `zs-fill` (verify_jwt, SA s rozsahem Drive+Docs, Gemini čte LV). Píše přímo do existujícího Google Dokumentu ve složce klienta `ZS` (žádná kopie): nemovitost + podíl na společných částech + spoluvlastnický podíl z LV, vybavení, min. kupní cena jen z `listing_price` (nikdy z Valua), provize = zadané % (výchozí 4), smluvní pokuta vždy 4 %, místo a datum (Ve Valticích u jižní Moravy, jinak V Praze), chybějící údaje žlutě `[[DOPLNIT: …]]`. Znovu spuštěné je bezpečné (nic nezdvojuje). U osobního vlastnictví (vše kromě družstevního – `intake.values.ownership` / kategorie bez „družstev“) se vždy vypustí ujednání o družstevním podílu: v Čl. I odst. 3 „či smlouvu o převodu družstevního podílu“ a v odst. 4 b) věta „v případě převodu družstevního podílu … bytovému družstvu“ (pravidlo Martina, 23. 10. 2026; mazání podle textu v odstavci, ne podle čísla). Verze 3: výběr firmy v dialogu (ostatní dvě varianty se smažou), údaje klienta z prodávajících (u více vlastníků další osoby), varianty nemovitosti byt/dům+pozemek, a **PEP prohlášení + čestné prohlášení se kopírují pro každého vlastníka** (jméno, RČ, adresa se doplní do každé dvojice). Šablona má jen 2 podpisová místa „Klient“ (u 3+ vlastníků nutno doplnit ručně). SA musí mít na složce KLIENTI roli „Správce obsahu“ a v Cloud projektu zapnuté Google Docs API. Sekce Dokumenty z detailu obchodu odstraněna (Dokumenty/doc-generate se z aplikace nevolá). Klientský portál je vždy zapnutý (`PortalCard` ho zakládá sám), `portal_stats.history` drží denní hodnoty pro grafy.
- **Google recenze v portálu (22. 10. 2026):** slider „Co o mně říkají klienti“ pod kontaktem v portálu (`GoogleReviews` v `Portal.tsx`) → veřejná edge funkce `google-reviews` (Places API New, place ID `ChIJDTgr9CaVC0cRIPUxjIyjNP8`, cache 12 h v paměti, bere jen 4–5★ s textem; Google vrací max. 5 recenzí). Klíč `GOOGLE_PLACES_KEY` vložen (22. 10. 2026), slouží jen pro živé hodnocení/počet. **Recenze jsou ručně vybrané (jen o prodeji nemovitosti, max. 20, nyní 19) a zapsané přímo v `supabase/functions/google-reviews/index.ts`** – Places API vrací jen 5 recenzí. Nové recenze se přidávají úpravou pole `REVIEWS` a nasazením funkce.
- **Načtení z Disku v náboru (22. 10. 2026, nasazeno):** zelená karta nahoře v kroku 1 → edge funkce `lv-extract` čte jen složky klienta `LV`, `Evidenční list`, `PENB` (souběžně, ~35 s), navrhne adresu/parcely/plochy, fond oprav, služby, energie, SVJ, třídu a hodnotu PENB; nic se nevyplní bez zaškrtnutí. Z obchodu se předvyplňuje cena a adresa (`withDealData`).
- **Údaje z RUIAN (22. 10. 2026; zdarma, veřejná data):** + parcely (výměra, druh, zahrada, zastavěná plocha), GPS `lat`/`lng` a upozornění na chráněná území (CHKO, NP, Natura…); karta „Načíst údaje o domě z registru“ v kroku 1 náboru (byt/dům) → edge funkce `ruian-building` (ČÚZK ArcGIS `ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer`, vrstva 1 AdresniMisto → 3 StavebniObjekt): počet bytů (`units_total`), podlaží, rok dokončení, konstrukce, výtah, vytápění, PSČ; návrh se zaškrtává, nic se nevyplní samo.
- **Pravidlo LV u bytu:** užitná plocha = první číslo ze zlomku „Podíl na společných částech domu a pozemku“ ÷ 100, vždy zaokrouhleno na celé m² (4259/161770 → 43 m²); když vyjde < 15 m², bere se ÷ 10 (526/10250 → 53 m²; některé domy mají podíl v desetinách m²); počítá `lv-extract`.
- **Nadpis a popis inzerátu (22. 10. 2026):** poslední krok náboru „Nadpis a popis inzerátu“ (pole `title`, `description`), zelené tlačítko „Vygenerovat nadpis a popis inzerátu“ → edge funkce `listing-text` (Gemini, z údajů formuláře přes `describeFacts`, bez ceny/LV/vlastníků, respektuje zobrazení adresy). Dříve „Název nabídky“ v 1. kroku – přesunuto.
- **Obchod z e-mailu (rozpracováno 22. 10. 2026):** edge funkce `deal-from-email` je nasazená (verify_jwt=false, repo `supabase/functions/deal-from-email`), ale **nefunguje, dokud Martin nevloží secret `INBOUND_EMAIL_KEY`** (Supabase → Edge Functions → Secrets, min. 20 znaků, sám, nikdy do chatu). Zbývá: Make scénář (složka „Claude Create“) hlídající Gmail adresu `reality+obchod@martintesarek.cz` → POST na funkci s hlavičkou `x-inbound-key` a tělem {subject, from, body, message_id, link}; pak test na ukázkovém e-mailu (kontrola dedupe přes message_id) a úklid testovacích dat. Funkce zakládá kontakt (Lead) + obchod ve fázi Prvotní kontakt, role prodávající, poznámku se shrnutím a textem e-mailu.
- Hotovo 22. 10. 2026: GoSMS klíče vloženy a test SMS prošel; v Make vypnut scénář Narozeniny klienta (1480058) a ze Svátek klienta (1106235) odstraněny klientské větve (zůstali makléři ČR/SK); texty SMS v CRM končí podpisem „odesláno prostřednictvím SMS brány…“; Věruška začíná jen „Poslouchám.“.
- Martin: role „Správce obsahu“ pro crm-disk@ na složce KLIENTI; vypnout veřejnou registraci (hotovo), zapnout vlastní 2FA v CRM; smazat v UI testovací kontakt „Tomáš __test“; Google Calendar a Gmail (vyžaduje Google Cloud kroky).
- Seznam kontaktů: do výběru „Sloupce“ přidat vlastní pole a štítky z ClickUpu (`tags`).
- Dále v plánu: Make webhooky / migrace scénářů (SMS o záloze, e-mail o inzerci, zaslání RS/ZS…),
  dokončení importu z ClickUpu (podúkoly, popisy, 23 náhledů, data změn fází), pozvat Barboru,
  smazat nepoužívaný Google OAuth secret (`VJfF`), Gemini billing na prepay (Martin),
  vlastní MCP server pro CRM (náhrada ClickUp MCP), případně štítky pro makléře.

- **Velké obrazovky (23. 10. 2026):** nástěnka od 1500 px používá 12 sloupců a šířku až 1900 px (`SPAN` v `dashboard.ts`), Nastavení až 1280 px, Hlídač katastru přepracován (přehled dlaždic + tabulka ostatních, na xl postranní panel se změnami), Nemovitosti – nástěnka fází roztažená na šířku. Zbývá projít detail obchodu, kontakty a Nastavení na širokém monitoru.
- **Sreality export (23. 10. 2026, rozpracováno):** edge funkce `sreality-export` (secrets `SREALITY_CLIENT_ID`, `SREALITY_PASSWORD`, `SREALITY_SOFTWARE_KEY`; testovací klíč `sreality-test`), karta `SrealityCard` v posledním kroku náboru, stav v `intake.values.sreality`. Spojení funguje; čeká se na založení makléře na testovacím účtu Sreality, pak první odeslání. Video se neposílá.
- **Fotky a video inzerátu:** krok „Fotky a video" v náboru (`values.photos`, `photos_up`, `video_url`, Storage `{account}/inzerat/{deal}/…`), „Pořadí v inzerátu" s drag&drop a křížkem pro odebrání.
- **Jednotné rozvržení stránek (23. 10. 2026, pravidlo Martina – dodržovat u každé nové stránky):** každá hlavní stránka začíná stejně: obal `px-4 md:px-9 pt-11 md:pt-8` (zarovnané vlevo, nikdy `mx-auto`), hlavička `min-h-[44px]` a nadpis `h1` třídou `m-0 text-[26px] md:text-[30px] font-extrabold tracking-tight`. U hlavních stránek (Nástěnka, Nemovitosti, Kontakty, Věruška, Hlídač, Nastavení) **není tlačítko Zpět** – to mají jen detaily a formuláře. Datum na nástěnce je vpravo vedle tlačítka Upravit, ne nad nadpisem.
- **Valuo v portálu (23. 10. 2026, pravidlo Martina):** odhad se klientovi v portálu ukáže vždy, když je vytvořený (`portal_get` vrací `valuo`, pokud `shared` není `false`); skrýt jde klepnutím v ValuoSheet. Platí místo dřívějšího „jen po Ukázat klientovi“.
- **Mapa (23. 10. 2026):** `MapCard` bere adresu z náběrového formuláře (`intake.values` street+cp, zip+city), obchodní adresa jen jako záloha; tlačítko „Obnovit mapu“.
- **Nástěnka – Nemovitosti v prodeji (23. 10. 2026):** odkaz „Filtr“ v hlavičce widgetu → výběr fází zaškrtnutím (`WidgetCfg.stages` v `profiles.settings.dashboard`); výchozí = otevřené fáze bloků Prodej a Uzavření.

- **Odpovědi klientů na SMS (23. 10. 2026, rozpracováno):** GoSMS webhook „Odpovědi“ → edge funkce `sms-reply` (verify_jwt=false, heslo z HTTP Basic = secret `GOSMS_WEBHOOK_KEY`, vkládá Martin) → tabulka `sms_replies` (migrace 15, **SQL musí Martin spustit v SQL Editoru**). Zobrazení: karta „SMS komunikace“ v kontaktu (odpověď zlatě, otevření kontaktu = přečteno), widget nástěnky `replies` „Odpovědi na SMS“ (první), červený zvoneček u Nástěnky v menu. **Podmínka:** kanál GoSMS 350324 musí mít v Samoobsluze zapnuto „Chci přijímat odpovědi“ (jen u SMS z čísla, ne z textového odesílatele) a podpis SMS dnes posílá odpověď na osobní číslo – po zapnutí upravit podpis. Odpověď se v GoSMS páruje jen 24 h.
- **WSDP (stahování LV z katastru, 23. 10. 2026):** edge funkce `wsdp` (secrets `WSDP_USER`, `WSDP_PASS`; `trial:true` = zkušební WSTEST funguje). Ostrý katastr zatím odmítá přihlášení (špatné údaje nebo IP adresa) – čeká se na odpověď ČÚZK (ticket 151883). Tlačítko v aplikaci zatím není.
- **Push upozornění (23. 10. 2026):** Nastavení → Můj účet → „Upozornění na telefonu a v počítači“ (`PushCard` v `Settings.tsx`, zapíná se zvlášť na každém zařízení; iPhone jen z plochy). `public/sw.js` (cache v4) zobrazí upozornění a otevře odkaz. Edge funkce `push-notify` (verify_jwt=false; cron `push-scan` každou minutu s `x-cron-key`; s JWT akce `key` a `test`) posílá: odpověď na SMS, změnu/chybu Hlídače katastru, úkoly s dnešním termínem (jednou denně od 7:00). VAPID klíče si funkce vytvoří sama v tabulce `push_config` (žádný secret). Tabulky `push_subscriptions` (prefs po druzích), `push_sent`, `push_config` + sloupce `notified_at` – **migrace 16, SQL spouští Martin v SQL Editoru** (obsahuje i cron job). Nově také obnova odpovědí na SMS každých 20 s na nástěnce a ve zvonečku.
- **Později (23. 10. 2026, rozhodnutí Martina):** synchronizace kontaktů s telefonním číslem do iPhonu přes Google Kontakty (People API, jednosměrně CRM → Google, štítek „CRM“, hodinový cron, souhlas a zapnutí API dělá Martin sám); zatím nezačato, čeká na jeho „ano“ a volbu, zda všechny kontakty, nebo jen vybrané typy.
- **Sankční seznam EU (23. 10. 2026, kód nahrán, čeká na token + migraci 19):** karta `SanctionsCard` v detailu kontaktu → edge funkce `sanctions-check` (akce `status`, `check`, `refresh`; refresh stahuje XML Financial Sanctions Files z webgate.ec.europa.eu, secret `EU_SANCTIONS_TOKEN` vkládá Martin sám – registrace na portálu EU, ten měl 23. 10. výpadek). Tabulky `sanctions_entries`, `sanctions_meta`, sloupec `contacts.sanctions`, cron `sanctions-refresh` denně 5:11 UTC (**migrace 19 – SQL spouští Martin**). Shoda = všechna jména klienta v záznamu; „silná“ při stejném počtu slov a shodě roku narození. Jen podklad „možná shoda – zkontrolovat“, nic se klientovi neoznačuje. **Bank iD (23. 10. 2026, kód nahrán, čeká na přístup + migraci 20):** karta `BankIdCard` v kontaktu → „Poslat ověření SMS“ (Martin text SMS před odesláním potvrdí, odkaz `/overeni/:token`, veřejná stránka `pages/Overeni.tsx`) → edge funkce `bankid-verify` (OIDC code flow, scope openid + profile.name/birthdate/gender/addresses/idcards, token přes Client Secret POST; návrat GET na funkci; secrets `BANKID_CLIENT_ID`, `BANKID_CLIENT_SECRET`, `BANKID_BASE` – výchozí zkušební oidc.sandbox.bankid.cz, ostrou adresu doplnit z Developer Portal; redirect URI = `https://aowceqpaawxeugalapgx.supabase.co/functions/v1/bankid-verify`). Tabulka `bankid_verifications` (migrace 20 – SQL spouští Martin), údaje se do kontaktu doplní jen prázdná pole po klepnutí „Doplnit“. Neotestováno (chybí přístup). Právně: nechat potvrdit JUDr. Černochovou, zda Bank iD nahrazuje kopii OP při AML identifikaci.
- **Topování na Sreality (23. 10. 2026):** karta `SrealityCard` → „Topovat teď“ + „Topovat automaticky“ (dny Po–Ne, hodina, pražský čas; `intake.values.sreality.{auto_top,top_days,top_hour,topped_on}`; prázdné `top_days` = každý den). Edge funkce `sreality-export` (verify_jwt=false, sama ověřuje JWT/cron klíč) má akce `top` a `top-scan`; cron `sreality-top` hodinově v :07 (**migrace 17 – SQL spouští Martin**). Topování stojí 25 Kč bez DPH, max. 3× denně, v den vložení nejde; na testovacím účtu nezveřejněný inzerát vrátí 479.

- **Elektronický podpis ZS/RS (23. 10. 2026, nasazeno kód + funkce `sign`; čeká na migraci 18):** detail obchodu → Automatizace → „Poslat k podpisu“ (`SignSheet.tsx`): výběr PDF/Google Dokumentu ze složek ZS/RS klienta → Martin ručně klepnutím umístí podpisová pole pro každého podepisujícího (`PdfPages.tsx`, pdfjs-dist) → text SMS se ukáže a Martin odešle → klient na `/podpis/:token` (`pages/Podpis.tsx`, veřejná) ověří SMS kódem, podepíše prstem. Edge funkce `sign` (verify_jwt=false; pdf-lib vloží podpisy, na konec přidá potvrzovací stranu s otiskem SHA-256, časem, IP, zařízením; podepsané PDF do Storage `files/{account}/sign/{id}/` a best-effort na Disk do složky zdroje – potřebuje roli „Správce obsahu“). Tabulky `sign_requests`, `sign_signers` (**migrace 18 – SQL spouští Martin**). Jde o prostý elektronický podpis – ne pro kupní smlouvu / návrh na vklad / ověřený podpis; před ostrým používáním nechat potvrdit JUDr. Černochovou. Potvrzovací strana tahá písmo Noto Sans z jsdelivr (při selhání Helvetica bez diakritiky).

- **Náběr – zástavní právo, věcné břemeno, fond oprav (23. 10. 2026):** v kartě Cena u všech typů přepínače „Zástavní právo“ a „Věcné břemeno“ (`lien`, `easement`) s popisem z LV a odkazem na LV (`lien_text`, `easement_text`, `lv_link`; plní `lv-extract`, Martin zrušil dřívější „bez polí břemeno“). Jen u bytu: „Naspořeno ve fondu oprav“ (`fund_saved`, Kč) a přepínač „SVJ má dluhy“ (`svj_debt`). Sreality export tato pole zatím neposílá (neověřeno, zda je Sreality má).

- **Družstvo / SVJ v rejstříku (23. 10. 2026):** u bytu karta `SvjCard` v posledním kroku náboru → edge funkce `svj-lookup` (verify_jwt=false, přihlášení ověřuje přímo dotazem na `/auth/v1/user`; ARES REST vyhledání podle názvu/IČO). Uloží se do `intake.values`: `svj` (název), `svj_ico`, `svj_rejstrik`, `svj_sbirka` (odkaz `or.justice.cz/ias/ui/rejstrik-$firma?ico=…` na rejstřík i Sbírku listin s účetními závěrkami; Martin je chce později propisovat na web prodávané nemovitosti). Krok 2 (automatické čtení závěrek z justice.cz → fond oprav, závazky) zatím nezačato; přímý odkaz na listiny vyžaduje `subjektId` z výsledku hledání. Diagnostiku chyby `session_not_found` vyřešilo opětovné přihlášení.
- **SVJ – závěrky (23. 10. 2026):** `svj-lookup` má akce `documents` (justice.cz: IČO → subjektId → výpis Sbírky listin, funguje; ukládá `svj_docs` JSON) a `financials` (poslední rok: stáhne PDF rozvahy/výsledovky/přílohy, Gemini vyčte fond oprav, výsledek hospodaření, úvěry, závazky). Martin chce jen poslední závěrku. Po zaškrtnutí se plní `fund_saved`, `svj_result`, `svj_debt` + `svj_debt_text`. Stahování PDF z justice.cz a čtení Gemini zatím neotestováno (Gemini kredit!).
