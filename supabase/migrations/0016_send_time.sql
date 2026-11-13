-- Horário do envio (Brasília). Quem programou antes continua saindo às 8h.
alter table public.scheduled_emails
  add column if not exists send_at time not null default '08:00';

-- O cron da Vercel (plano Hobby) roda uma vez por dia. Para sair no horário escolhido,
-- o próprio Supabase chama /api/cron/emails a cada 5 minutos.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- O segredo NÃO fica aqui nem no git. Rode uma vez, à parte, com o mesmo CRON_SECRET da Vercel:
--   select vault.create_secret('<CRON_SECRET>', 'anotion_cron_secret');
select cron.unschedule('anotion-emails') where exists (select 1 from cron.job where jobname = 'anotion-emails');
select cron.schedule('anotion-emails', '*/5 * * * *', $job$
  select net.http_get(
    url := 'https://projeto-anotion.vercel.app/api/cron/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || coalesce(
      (select decrypted_secret from vault.decrypted_secrets where name = 'anotion_cron_secret'), ''))
  );
$job$);
