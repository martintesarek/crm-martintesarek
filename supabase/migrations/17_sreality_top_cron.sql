-- Denní automatické topování inzerátů na Sreality: každou hodinu v :07 se funkce podívá, kterým inzerátům nastal čas topování.
select cron.unschedule('sreality-top') where exists (select 1 from cron.job where jobname = 'sreality-top');
select cron.schedule('sreality-top', '7 * * * *', $$select net.http_post(url := 'https://aowceqpaawxeugalapgx.supabase.co/functions/v1/sreality-export', headers := jsonb_build_object('Content-Type','application/json','x-cron-key',(select decrypted_secret from vault.decrypted_secrets where name='cron_key')), body := '{"action":"top-scan"}'::jsonb)$$);
