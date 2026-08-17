-- Repro Bovine v1.7.1 — Cron SANS Vault
-- À exécuter seulement APRÈS avoir testé la vraie Edge Function repro-notifications.
-- Vérifie toutes les 15 minutes. La fonction n’envoie qu’un récap par jour
-- quand l’heure paramétrée dans l’application est atteinte.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname='repro-bovine-notifications') then
    perform cron.unschedule('repro-bovine-notifications');
  end if;
end $$;

select cron.schedule(
  'repro-bovine-notifications',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://uuyiazyofyyuxwiolizr.supabase.co/functions/v1/repro-notifications',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','sb_publishable_FtQAhsVfoPbyG1hD3lT1VQ_LhgiW8Hl'
    ),
    body := '{}'::jsonb
  );
  $cron$
);
