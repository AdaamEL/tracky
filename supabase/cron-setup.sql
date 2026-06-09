-- =============================================================
-- Tracky — Configuration des cron jobs
-- À exécuter UNE SEULE FOIS dans le SQL Editor de Supabase
-- (Project → SQL Editor → New Query → colle ce fichier → Run)
--
-- Avant de lancer : remplace REMPLACE_PAR_TA_SERVICE_ROLE_KEY
-- par ta vraie clé que tu trouves ici :
-- Project Settings → API → service_role (secret)
-- =============================================================

-- Supprime les anciens jobs s'ils existent
SELECT cron.unschedule('send-notifications') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-notifications'
);
SELECT cron.unschedule('daily-digest') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-digest'
);

-- Rappel d'événement : toutes les minutes
SELECT cron.schedule(
  'send-notifications',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://bzqaixheecoqhuzqhhpz.supabase.co/functions/v1/send-notifications',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6cWFpeGhlZWNvcWh1enFoaHB6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTU2MTgxNywiZXhwIjoyMDk1MTM3ODE3fQ.PHKPzkhKgtd175PBrrtgAyXzjnlMP1N96mqc1F7l9jw"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);

-- Digest quotidien : tous les jours à 6h UTC (= 7h heure de Paris en hiver)
SELECT cron.schedule(
  'daily-digest',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://bzqaixheecoqhuzqhhpz.supabase.co/functions/v1/daily-digest',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6cWFpeGhlZWNvcWh1enFoaHB6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTU2MTgxNywiZXhwIjoyMDk1MTM3ODE3fQ.PHKPzkhKgtd175PBrrtgAyXzjnlMP1N96mqc1F7l9jw"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);

-- Vérifie que les jobs sont bien créés
SELECT jobname, schedule, command FROM cron.job ORDER BY jobid;