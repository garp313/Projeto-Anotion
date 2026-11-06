-- E-mails programados: pedir às pessoas que preencham uma página, uma vez ou com repetição.
create table public.scheduled_emails (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipients text[] not null check (cardinality(recipients) between 1 and 20),
  subject text not null check (char_length(subject) between 1 and 200),
  message text not null check (char_length(message) between 1 and 5000),
  -- A repetição conta do primeiro envio: "todo dia 31" não vira dia 28 para sempre depois de fevereiro.
  first_send_on date not null,
  send_on date not null,
  repeat text not null default 'none' check (repeat in ('none', 'weekly', 'monthly')),
  active boolean not null default true,
  last_sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index scheduled_emails_due on public.scheduled_emails(send_on) where active;

alter table public.scheduled_emails enable row level security;

-- Sai do Gmail de quem programou: só essa pessoa vê e mexe. O cron usa a chave de servidor.
create policy "scheduled_emails: quem criou" on public.scheduled_emails for all to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and exists (select 1 from public.pages p where p.id = page_id));
