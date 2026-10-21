# Bezpečnost CRM – měsíční audit (kontrolní seznam)

Spouští se každý měsíc automaticky. Audit nic nemění, jen zjišťuje a hlásí. Opravy dělá až po schválení Martina.
Martin není programátor: výsledek piš česky, jednoduše, seřazený (kritické / vysoké / střední / nízké), u každého nálezu co je špatně, jak by se zneužilo a jak se opraví.

## Databáze (Supabase aowceqpaawxeugalapgx)
1. Každá tabulka v `public` má zapnuté RLS a aspoň jednu politiku (`pg_class.relrowsecurity`, `pg_policies`). Žádná politika `using (true)` u tabulek s osobními daty.
2. Role `anon` nemá práva na žádnou tabulku (kromě případných záměrných) a smí spouštět jen `portal_get`.
3. `get_advisors` typu security a performance: nové varování = nález.
4. Politiky pro makléře: obchody a kontakty vidí jen admin/owner nebo přiřazený makléř (`can_see_contact`, politiky `deals_*`, `contacts_*`).
5. Nové tabulky vzniklé od minulého auditu: mají RLS, nemají práva pro anon?
6. Storage buckety: `files` a `voice` jsou privátní, mají limit velikosti a povolené typy; `covers` je jediný veřejný a nejde z něj vypsat obsah.
7. Funkce `security definer` spustitelné anonymem nebo přihlášeným: jen záměrné (`portal_get`, `is_member`, `is_admin`, `log_access`, `reveal_birth_number`, GDPR funkce).
8. Rodná čísla: `contacts.birth_number` musí začínat `enc:` (žádný čitelný záznam). Žádná rodná čísla v `notes`/`custom` (regex `\d{6}\s?/\s?\d{3,4}`).
9. Tabulky s kopií osobních dat (importy, `*_stage`): nemají zůstat.

## Audit log a neobvyklé chování
10. `audit_log` za posledních 30 dní: záznamy `alert_bulk_read`, neobvykle mnoho `reveal_birth_number`, `gdpr_export`, `gdpr_erase`, `download_document`, hromadné `delete`. Shrň kdo/kdy/kolik.
11. Členové (`memberships`) a pozvánky (`invites`): nečekaný nový člen nebo admin = kritický nález.
12. API logy (`query_logs`, service api/auth/edge-function): vlny chyb 401/403/429, přihlášení z neobvyklých míst, podezřelé volání funkcí.

## Funkce na serveru (Edge Functions)
13. `list_edge_functions`: nové funkce? Každá musí ověřovat přihlášení (JWT) nebo tajný klíč, mít omezení počtu volání (`rate_check`) a CORS jen pro `https://crm.martintesarek.cz`.
14. V kódu funkcí a v repozitáři nesmí být natvrdo klíče, hesla ani tokeny (grep na `eyJ`, `sk-`, `AIza`, `BEGIN PRIVATE`, `secret`).
15. cron joby (`cron.job`): klíč se čte z trezoru, ne z textu.

## Web (GitHub martintesarek/crm-martintesarek, Vercel)
16. `vercel.json` obsahuje CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy; ověř odpověď z https://crm.martintesarek.cz.
17. `npm audit --omit=dev`: zranitelné balíčky (vysoké a kritické = nález).
18. V kódu žádné `dangerouslySetInnerHTML`, `eval`, `innerHTML`; žádné `service_role` ve `src/`.
19. Soubory v `public/` neobsahují osobní údaje.

## Přihlašování (kontrola v administraci Supabase – Martin musí ověřit ručně a potvrdit)
20. Authentication → Providers/Policies: potvrzení e-mailu zapnuté, ochrana proti uniklým heslům zapnutá, min. délka hesla 12, registrace nových uživatelů vypnutá (jen pozvánky).
21. Dvoufázové ověření zapnuté u všech adminů (v CRM: Nastavení → Můj účet).
22. Přesná doba platnosti relace a časový limit nečinnosti (pokud tarif umožňuje).

## GDPR
23. Funkce pro export a smazání dat klienta fungují (`gdpr_export_contact`, `gdpr_erase_contact`), zápis do auditního logu.
24. Minimalizace: žádná nová osobní pole bez důvodu. Hlasové nahrávky klientů starší než 12 měsíců: navrhni smazání (nemaž bez souhlasu).

## Výstup
Souhrn: nové nálezy, vyřešené nálezy od minulého měsíce, co musí udělat Martin ručně. Nic neopravuj bez jeho „ano“.
