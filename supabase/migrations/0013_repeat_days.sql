-- Dias escolhidos na repetição: 0 a 6 (domingo a sábado) por semana, 1 a 31 por mês.
alter table public.scheduled_emails
  add column if not exists repeat_days int[] not null default '{}'
  check (cardinality(repeat_days) <= 31 and 0 <= all (repeat_days) and 31 >= all (repeat_days));
