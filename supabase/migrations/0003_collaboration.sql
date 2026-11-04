-- Colaboração: membros, convites, compartilhamento por página, comentários, atividade,
-- notificações e versões. Todas as políticas são aditivas: as regras de dono da 0001
-- continuam valendo, então esta migration não tira o acesso de ninguém.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'pages' and column_name = 'seq') then
    raise exception 'Rode a migration 0002_databases.sql antes desta.';
  end if;
end $$;

-- ---------------------------------------------------------------- pessoas
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default ''
);

create or replace function public.sync_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), ''))
  on conflict (id) do update set email = excluded.email, name = excluded.name;
  return new;
end $$;

create trigger on_auth_user_profile after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.sync_profile();

insert into public.profiles(id, email, name)
select id, coalesce(email, ''), coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1), '')
from auth.users
on conflict (id) do nothing;

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.page_shares (
  page_id uuid not null references public.pages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (page_id, user_id)
);

-- Sem page_id o convite é para o workspace inteiro.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  page_id uuid references public.pages(id) on delete cascade,
  email text not null,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  invited_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index invites_once on public.invites(workspace_id, coalesce(page_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(email));

-- Funções usadas pelas políticas. Devolvem conjuntos, para o Postgres calcular uma vez por
-- consulta em vez de uma vez por linha: a lista de páginas continua rápida para o dono.
create or replace function public.my_workspace_ids(only_editable boolean default false) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.workspaces where owner_id = auth.uid()
  union
  select workspace_id from public.workspace_members
  where user_id = auth.uid() and (not only_editable or role = 'editor')
$$;

-- Compartilhar uma página inclui as subpáginas e as linhas dela.
create or replace function public.my_shared_page_ids(only_editable boolean default false) returns setof uuid
language sql stable security definer set search_path = public as $$
  with recursive tree as (
    select page_id as id from public.page_shares
    where user_id = auth.uid() and (not only_editable or role = 'editor')
    union
    select p.id from public.pages p join tree t on p.parent_id = t.id
  )
  select id from tree
$$;

create or replace function public.my_coworker_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select owner_id from public.workspaces where id in (select public.my_workspace_ids())
  union
  select user_id from public.workspace_members where workspace_id in (select public.my_workspace_ids())
  union
  select s.user_id from public.page_shares s join public.pages p on p.id = s.page_id
  where p.workspace_id in (select public.my_workspace_ids())
  union
  select w.owner_id from public.workspaces w join public.pages p on p.workspace_id = w.id
  where p.id in (select public.my_shared_page_ids())
$$;

alter table public.profiles enable row level security;
alter table public.workspace_members enable row level security;
alter table public.page_shares enable row level security;
alter table public.invites enable row level security;

create policy "profiles: colegas" on public.profiles for select
  using (id = auth.uid() or id in (select public.my_coworker_ids()));

create policy "members: quem participa vê" on public.workspace_members for select
  using (workspace_id in (select public.my_workspace_ids()));
create policy "members: dono gerencia" on public.workspace_members for all
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
create policy "members: sair do workspace" on public.workspace_members for delete
  using (user_id = auth.uid());

create policy "shares: envolvidos veem" on public.page_shares for select
  using (user_id = auth.uid() or page_id in (select id from public.pages where workspace_id in (select public.my_workspace_ids())));
create policy "shares: dono gerencia" on public.page_shares for all
  using (exists (select 1 from public.pages p join public.workspaces w on w.id = p.workspace_id where p.id = page_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.pages p join public.workspaces w on w.id = p.workspace_id where p.id = page_id and w.owner_id = auth.uid()));

create policy "invites: dono gerencia" on public.invites for all
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));

-- ---------------------------------------------------------------- acesso às páginas (aditivo)
create policy "workspace: membros leem" on public.workspaces for select
  using (id in (select public.my_workspace_ids()));

-- parent_id cobre a linha recém-criada numa página compartilhada: o "returning" do insert a lê
-- antes de ela aparecer em my_shared_page_ids.
create policy "pages: membros e compartilhados leem" on public.pages for select
  using (workspace_id in (select public.my_workspace_ids()) or id in (select public.my_shared_page_ids())
         or parent_id in (select public.my_shared_page_ids()));
create policy "pages: editores alteram" on public.pages for update
  using (workspace_id in (select public.my_workspace_ids(true)) or id in (select public.my_shared_page_ids(true)))
  with check (workspace_id in (select public.my_workspace_ids(true)) or id in (select public.my_shared_page_ids(true)));
create policy "pages: editores criam" on public.pages for insert
  with check (workspace_id in (select public.my_workspace_ids(true)) or parent_id in (select public.my_shared_page_ids(true)));

create policy "files: colegas leem" on storage.objects for select
  using (bucket_id = 'files' and (storage.foldername(name))[1] in (select id::text from public.my_coworker_ids() as t(id)));

-- Convida por e-mail. Quem já tem conta confirmada entra na hora; os demais, no primeiro login.
create or replace function public.invite_by_email(p_workspace uuid, p_page uuid, p_email text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if not exists (select 1 from public.workspaces where id = p_workspace and owner_id = auth.uid()) then
    raise exception 'Só o dono do workspace pode convidar.' using errcode = '42501';
  end if;
  if p_role not in ('editor', 'viewer') then raise exception 'Papel inválido.'; end if;
  if p_page is not null and not exists (select 1 from public.pages where id = p_page and workspace_id = p_workspace) then
    raise exception 'Página de outro workspace.' using errcode = '42501';
  end if;

  select id into target from auth.users
  where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null;

  if target is null then
    insert into public.invites(workspace_id, page_id, email, role, invited_by)
    values (p_workspace, p_page, lower(trim(p_email)), p_role, auth.uid())
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

-- Só e-mail confirmado aceita convite: senão bastaria criar conta com o endereço de outra pessoa.
create or replace function public.accept_invites() returns integer
language plpgsql security definer set search_path = public as $$
declare mail text; total integer := 0; i public.invites;
begin
  select lower(email) into mail from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if mail is null then return 0; end if;
  for i in select * from public.invites where lower(email) = mail loop
    if i.page_id is null then
      insert into public.workspace_members(workspace_id, user_id, role) values (i.workspace_id, auth.uid(), i.role)
      on conflict (workspace_id, user_id) do nothing;
    else
      insert into public.page_shares(page_id, user_id, role) values (i.page_id, auth.uid(), i.role)
      on conflict (page_id, user_id) do nothing;
    end if;
    delete from public.invites where id = i.id;
    total := total + 1;
  end loop;
  return total;
end $$;

-- Quem pode ser atribuído ou mencionado.
create or replace function public.collaborators() returns table (id uuid, name text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.email from public.profiles p
  where p.id = auth.uid() or p.id in (select public.my_coworker_ids())
$$;

-- ---------------------------------------------------------------- comentários, atividade, inbox, versões
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index comments_page_idx on public.comments(page_id, created_at);

create table public.page_activity (
  id bigint generated always as identity primary key,
  page_id uuid not null references public.pages(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  prop text not null,
  from_text text not null default '',
  to_text text not null default '',
  created_at timestamptz not null default now()
);
create index page_activity_page_idx on public.page_activity(page_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('assigned', 'mention', 'comment', 'status')),
  page_id uuid references public.pages(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create index notifications_outbox_idx on public.notifications(actor_id) where emailed_at is null;

create table public.page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  title text not null,
  content_json jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index page_versions_page_idx on public.page_versions(page_id, created_at desc);

alter table public.comments enable row level security;
alter table public.page_activity enable row level security;
alter table public.notifications enable row level security;
alter table public.page_versions enable row level security;

-- "exists em pages" passa pelas políticas de pages: quem lê a página lê o que pertence a ela.
create policy "comments: quem lê a página" on public.comments for select
  using (exists (select 1 from public.pages p where p.id = page_id));
create policy "comments: quem lê a página comenta" on public.comments for insert
  with check (author_id = auth.uid() and exists (select 1 from public.pages p where p.id = page_id));
create policy "comments: autor apaga" on public.comments for delete using (author_id = auth.uid());

create policy "activity: quem lê a página" on public.page_activity for select
  using (exists (select 1 from public.pages p where p.id = page_id));
create policy "versions: quem lê a página" on public.page_versions for select
  using (exists (select 1 from public.pages p where p.id = page_id));

-- Notificações só nascem pelos gatilhos abaixo: não há política de insert.
create policy "notifications: destinatário lê" on public.notifications for select using (user_id = auth.uid());
create policy "notifications: destinatário marca" on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications: destinatário apaga" on public.notifications for delete using (user_id = auth.uid());

create or replace function public.person_ids(v jsonb) returns setof uuid
language sql immutable as $$
  select (e->>'id')::uuid
  from jsonb_array_elements(case when jsonb_typeof(v) = 'array' then v else '[]'::jsonb end) e
  where e->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

create or replace function public.mentioned_ids(doc jsonb) returns setof uuid
language sql immutable as $$
  select distinct (t #>> '{}')::uuid
  from jsonb_path_query(doc, '$.** ? (@.type == "mention" && @.props.kind == "person").props.target') t
  where (t #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

-- Texto legível do valor, gravado junto: o histórico não muda se a opção for renomeada depois.
create or replace function public.prop_text(col jsonb, v jsonb) returns text
language sql immutable as $$
  select case
    when v is null or v = 'null'::jsonb then ''
    when col->>'type' in ('select', 'status') then
      coalesce((select o->>'value' from jsonb_array_elements(coalesce(col->'options', '[]'::jsonb)) o where o->>'id' = v #>> '{}' limit 1), '')
    when col->>'type' = 'multi_select' and jsonb_typeof(v) = 'array' then
      coalesce((select string_agg(o->>'value', ', ') from jsonb_array_elements(coalesce(col->'options', '[]'::jsonb)) o where v ? (o->>'id')), '')
    when col->>'type' = 'person' and jsonb_typeof(v) = 'array' then
      coalesce((select string_agg(e->>'name', ', ') from jsonb_array_elements(v) e), '')
    when col->>'type' = 'date' and jsonb_typeof(v) = 'object' then
      left(v->>'start', 10) || coalesce(' → ' || left(v->>'end', 10), '')
    when col->>'type' = 'checkbox' then case when v = 'true'::jsonb then 'Sim' else 'Não' end
    when col->>'type' = 'relation' and jsonb_typeof(v) = 'array' then
      jsonb_array_length(v)::text || ' vínculo(s)'
    when col->>'type' = 'checklist' and jsonb_typeof(v) = 'array' then
      jsonb_array_length(v)::text || ' item(ns)'
    when jsonb_typeof(v) in ('string', 'number') then v #>> '{}'
    else ''
  end
$$;

create or replace function public.notify(target uuid, actor uuid, kind text, page uuid, message text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if target is null or target = actor then return; end if;
  insert into public.notifications(user_id, actor_id, kind, page_id, body) values (target, actor, kind, page, message);
end $$;

create or replace function public.page_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  who uuid;
  actor_name text;
  label text := coalesce(nullif(new.title, ''), 'Sem título');
  cols jsonb;
  col jsonb;
  k text;
  was jsonb;
  now_v jsonb;
  people uuid[] := '{}';
begin
  if actor is null then return new; end if;
  select coalesce(nullif(name, ''), email) into actor_name from public.profiles where id = actor;
  actor_name := coalesce(actor_name, 'Alguém');

  if new.parent_id is not null and new.row_properties is distinct from old.row_properties then
    select database_schema into cols from public.pages where id = new.parent_id and is_database;
    if cols is not null then
      for col in select * from jsonb_array_elements(cols) loop
        if col->>'type' = 'person' then
          people := people || array(select public.person_ids(new.row_properties->(col->>'id')));
        end if;
      end loop;
      for col in select * from jsonb_array_elements(cols) loop
        k := col->>'id';
        was := old.row_properties->k;
        now_v := new.row_properties->k;
        if was is not distinct from now_v or col->>'type' = 'title' then continue; end if;
        insert into public.page_activity(page_id, actor_id, prop, from_text, to_text)
        values (new.id, actor, col->>'name', public.prop_text(col, was), public.prop_text(col, now_v));

        if col->>'type' = 'person' then
          for who in select public.person_ids(now_v) except select public.person_ids(was) loop
            perform public.notify(who, actor, 'assigned', new.id, actor_name || ' atribuiu “' || label || '” a você');
          end loop;
        elsif col->>'type' = 'status' then
          foreach who in array people loop
            perform public.notify(who, actor, 'status', new.id,
              actor_name || ' mudou “' || label || '” para ' || coalesce(nullif(public.prop_text(col, now_v), ''), 'sem status'));
          end loop;
        end if;
      end loop;
    end if;
  end if;

  if new.title is distinct from old.title and new.parent_id is not null then
    insert into public.page_activity(page_id, actor_id, prop, from_text, to_text)
    values (new.id, actor, 'Título', old.title, new.title);
  end if;

  if new.content_json is distinct from old.content_json then
    for who in select public.mentioned_ids(new.content_json) except select public.mentioned_ids(old.content_json) loop
      perform public.notify(who, actor, 'mention', new.id, actor_name || ' mencionou você em “' || label || '”');
    end loop;
    -- Uma versão a cada 10 minutos de edição, com o conteúdo de antes da mudança.
    if jsonb_array_length(old.content_json) > 0 and not exists (
      select 1 from public.page_versions where page_id = new.id and created_at > now() - interval '10 minutes'
    ) then
      insert into public.page_versions(page_id, title, content_json, created_by) values (new.id, old.title, old.content_json, actor);
    end if;
  end if;
  return new;
end $$;

create trigger pages_changed after update on public.pages
for each row execute function public.page_changed();

create or replace function public.comment_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  label text;
  who uuid;
  pg public.pages;
  cols jsonb;
  col jsonb;
  followers uuid[] := '{}';
begin
  select * into pg from public.pages where id = new.page_id;
  label := coalesce(nullif(pg.title, ''), 'Sem título');
  select coalesce(nullif(name, ''), email, 'Alguém') into actor_name from public.profiles where id = new.author_id;

  foreach who in array new.mentions loop
    perform public.notify(who, new.author_id, 'mention', new.page_id, actor_name || ' mencionou você em “' || label || '”');
  end loop;

  select database_schema into cols from public.pages where id = pg.parent_id and is_database;
  if cols is not null then
    for col in select * from jsonb_array_elements(cols) loop
      if col->>'type' = 'person' then
        followers := followers || array(select public.person_ids(pg.row_properties->(col->>'id')));
      end if;
    end loop;
  end if;
  if pg.created_by is not null then followers := followers || pg.created_by; end if;
  for who in select distinct u from unnest(followers) u where u <> all(new.mentions) loop
    perform public.notify(who, new.author_id, 'comment', new.page_id, actor_name || ' comentou em “' || label || '”');
  end loop;
  return new;
end $$;

create trigger comments_added after insert on public.comments
for each row execute function public.comment_added();

-- E-mails ficam a cargo de quem agiu: lista só o que essa pessoa gerou e ainda não saiu.
create or replace function public.pending_emails()
returns table (id uuid, email text, body text, page_id uuid)
language sql stable security definer set search_path = public as $$
  select n.id, p.email, n.body, n.page_id
  from public.notifications n join public.profiles p on p.id = n.user_id
  where n.actor_id = auth.uid() and n.emailed_at is null and n.created_at > now() - interval '1 hour'
  order by n.created_at limit 20
$$;

create or replace function public.mark_emailed(ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update public.notifications set emailed_at = now() where id = any(ids) and actor_id = auth.uid()
$$;

-- Funções internas não ficam expostas pela API.
revoke execute on function public.notify(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.invite_by_email(uuid, uuid, text, text) from public, anon;
revoke execute on function public.accept_invites() from public, anon;
revoke execute on function public.collaborators() from public, anon;
revoke execute on function public.pending_emails() from public, anon;
revoke execute on function public.mark_emailed(uuid[]) from public, anon;
grant execute on function public.invite_by_email(uuid, uuid, text, text) to authenticated;
grant execute on function public.accept_invites() to authenticated;
grant execute on function public.collaborators() to authenticated;
grant execute on function public.pending_emails() to authenticated;
grant execute on function public.mark_emailed(uuid[]) to authenticated;
