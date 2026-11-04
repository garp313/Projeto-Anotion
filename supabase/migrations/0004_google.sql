-- Acesso fechado ao time e base das integrações Google que rodam com o navegador fechado.
do $$
begin
  if to_regclass('public.invites') is null then
    raise exception 'Rode a migration 0003_collaboration.sql antes desta.';
  end if;
end $$;

-- ---------------------------------------------------------------- acesso fechado
-- A URL é pública: só cria conta quem estiver nesta lista, por senha ou pelo Google.
create table public.allowed_emails (
  email text primary key check (email = lower(email)),
  is_admin boolean not null default false,
  added_at timestamptz not null default now()
);

insert into public.allowed_emails(email)
select lower(email) from auth.users where email is not null
on conflict (email) do nothing;

-- A conta mais antiga administra a lista. Para trocar:
-- update public.allowed_emails set is_admin = (email = 'novo@exemplo.com');
update public.allowed_emails set is_admin = true
where email = (select lower(email) from auth.users where email is not null order by created_at limit 1);

create or replace function public.is_app_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_emails a join auth.users u on lower(u.email) = a.email
    where u.id = auth.uid() and a.is_admin
  )
$$;

alter table public.allowed_emails enable row level security;
create policy "allowed: administrador gerencia" on public.allowed_emails for all
  using (public.is_app_admin()) with check (public.is_app_admin());

create or replace function public.require_allowed_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or not exists (select 1 from public.allowed_emails where email = lower(new.email)) then
    raise exception 'E-mail fora da lista do time.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger require_allowed_email before insert on auth.users
for each row execute function public.require_allowed_email();

-- Cada pessoa é dona do próprio workspace: sem esta regra, qualquer membro abriria o app para fora.
create or replace function public.invite_by_email(p_workspace uuid, p_page uuid, p_email text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  mail text := lower(trim(p_email));
begin
  if not exists (select 1 from public.workspaces where id = p_workspace and owner_id = auth.uid()) then
    raise exception 'Só o dono do workspace pode convidar.' using errcode = '42501';
  end if;
  if p_role not in ('editor', 'viewer') then raise exception 'Papel inválido.'; end if;
  if p_page is not null and not exists (select 1 from public.pages where id = p_page and workspace_id = p_workspace) then
    raise exception 'Página de outro workspace.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.allowed_emails where email = mail) then
    if not public.is_app_admin() then
      raise exception 'Só o administrador libera e-mails novos.' using errcode = '42501';
    end if;
    insert into public.allowed_emails(email) values (mail);
  end if;

  select id into target from auth.users where lower(email) = mail and email_confirmed_at is not null;

  if target is null then
    insert into public.invites(workspace_id, page_id, email, role, invited_by)
    values (p_workspace, p_page, mail, p_role, auth.uid())
    on conflict (workspace_id, coalesce(page_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(email))
    do update set role = excluded.role;
    return 'invited';
  end if;
  if p_page is null then
    insert into public.workspace_members(workspace_id, user_id, role) values (p_workspace, target, p_role)
    on conflict (workspace_id, user_id) do update set role = excluded.role;
  else
    insert into public.page_shares(page_id, user_id, role) values (p_page, target, p_role)
    on conflict (page_id, user_id) do update set role = excluded.role;
  end if;
  return 'added';
end $$;

-- ---------------------------------------------------------------- Google
-- Sem políticas: só o servidor, com a chave de serviço, lê estas tabelas.
create table public.google_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token_enc text not null,
  status text not null default 'ok' check (status in ('ok', 'reconnect')),
  daily_digest boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.calendar_channels (
  user_id uuid primary key references auth.users(id) on delete cascade,
  channel_id uuid not null unique,
  resource_id text not null,
  token text not null,
  sync_token text,
  expires_at timestamptz not null
);

-- Vínculo página ↔ item do Google: é o que impede duplicar na sincronização.
create table public.external_links (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  provider text not null check (provider in ('calendar', 'gmail')),
  kind text not null check (kind in ('deadline', 'focus', 'minutes', 'message')),
  external_id text not null,
  calendar_id text,
  prop text,
  owner_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (provider, kind, external_id)
);
create index external_links_page_idx on public.external_links(page_id);

alter table public.google_accounts enable row level security;
alter table public.calendar_channels enable row level security;
alter table public.external_links enable row level security;
revoke all on public.google_accounts, public.calendar_channels from anon, authenticated;

create policy "links: quem lê a página" on public.external_links for select
  using (exists (select 1 from public.pages p where p.id = page_id));

-- Eventos criados pelo botão "Agenda" antes desta migration.
insert into public.external_links(page_id, provider, kind, external_id, calendar_id, prop, owner_id)
select p.id, 'calendar', 'deadline', kv.value #>> '{}', 'primary', substr(kv.key, 8), p.created_by
from public.pages p, jsonb_each(p.row_properties) kv
where kv.key like '\_\_gcal\_%' and jsonb_typeof(kv.value) = 'string'
on conflict (provider, kind, external_id) do nothing;

-- O app pergunta só o próprio estado, sem nunca enxergar o token.
create or replace function public.google_status() returns table (status text, daily_digest boolean)
language sql stable security definer set search_path = public as $$
  select status, daily_digest from public.google_accounts where user_id = auth.uid()
$$;

create or replace function public.set_daily_digest(enabled boolean) returns void
language sql security definer set search_path = public as $$
  update public.google_accounts set daily_digest = enabled where user_id = auth.uid()
$$;

revoke execute on function public.google_status() from public, anon;
revoke execute on function public.set_daily_digest(boolean) from public, anon;
revoke execute on function public.is_app_admin() from anon;
grant execute on function public.google_status() to authenticated;
grant execute on function public.set_daily_digest(boolean) to authenticated;
