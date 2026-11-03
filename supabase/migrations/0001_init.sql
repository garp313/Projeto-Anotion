create extension if not exists pgcrypto;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Meu workspace',
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid references public.pages(id) on delete cascade,
  title text not null default '',
  icon text,
  cover text,
  content_json jsonb not null default '[]'::jsonb,
  position double precision not null default 0,
  -- databases: a página é um banco; as linhas são páginas filhas
  is_database boolean not null default false,
  database_schema jsonb not null default '[]'::jsonb,   -- [{id,name,type,options?}]
  row_properties jsonb not null default '{}'::jsonb,    -- {columnId: valor} nas linhas
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pages_workspace_idx on public.pages(workspace_id, is_archived);
create index pages_parent_idx on public.pages(parent_id, position);
create index pages_title_idx on public.pages using gin (to_tsvector('simple', title));

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger pages_touch before update on public.pages
for each row execute function public.touch_updated_at();

-- RLS
alter table public.workspaces enable row level security;
alter table public.pages enable row level security;

create policy "workspace: dono" on public.workspaces
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "pages: dono do workspace" on public.pages
  for all
  using (exists (select 1 from public.workspaces w where w.id = pages.workspace_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.workspaces w where w.id = pages.workspace_id and w.owner_id = auth.uid()));

-- Novo usuário => workspace + página de boas-vindas
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  insert into public.workspaces(name, owner_id)
  values (coalesce(split_part(new.email,'@',1),'Meu') || ' workspace', new.id)
  returning id into ws;
  insert into public.pages(workspace_id, title, icon, position)
  values (ws, 'Bem-vindo', '👋', 1);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
