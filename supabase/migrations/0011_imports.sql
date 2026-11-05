-- Importação do Notion: rastreio por lote, reimportar sem duplicar e desfazer.
alter table public.pages
  add column if not exists external_source text,
  add column if not exists external_id text,
  add column if not exists import_id uuid;

-- Parcial: item desfeito vai para a lixeira e pode ser importado de novo.
create unique index if not exists pages_external_once on public.pages(workspace_id, external_source, external_id)
  where external_id is not null and is_archived = false;

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  file_name text not null default '',
  mode text not null default 'add' check (mode in ('add', 'update')),
  mapping jsonb not null default '{}'::jsonb,
  report jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);

-- O estado anterior de cada página tocada: é o que permite desfazer também as atualizações.
create table public.import_changes (
  import_id uuid not null references public.imports(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  action text not null check (action in ('created', 'updated')),
  before jsonb,
  primary key (import_id, page_id)
);

alter table public.imports enable row level security;
alter table public.import_changes enable row level security;

create policy "imports: editores" on public.imports for all
  using (workspace_id in (select public.my_workspace_ids(true)))
  with check (workspace_id in (select public.my_workspace_ids(true)));
create policy "import_changes: editores" on public.import_changes for all
  using (exists (select 1 from public.imports i where i.id = import_id))
  with check (exists (select 1 from public.imports i where i.id = import_id));

-- Importar não é a equipe trabalhando: sem isto, cada linha geraria atividade, aviso e e-mail.
drop trigger if exists pages_changed on public.pages;
create trigger pages_changed after update on public.pages
for each row when (coalesce(current_setting('app.importing', true), '') <> '1')
execute function public.page_changed();

create or replace function public.import_pages(p_import uuid, p_workspace uuid, p_mode text, p_rows jsonb)
returns table (external_id text, page_id uuid, action text)
language plpgsql security invoker set search_path = public as $$
declare
  r jsonb;
  ext text;
  src text;
  cur public.pages;
  made uuid;
begin
  perform set_config('app.importing', '1', true);
  for r in select * from jsonb_array_elements(p_rows) loop
    ext := r->>'external_id';
    src := coalesce(r->>'external_source', 'notion');
    cur := null;
    select * into cur from public.pages p
    where p.workspace_id = p_workspace and p.external_source = src and p.external_id = ext and not p.is_archived;
    -- Export feito por este app usa o próprio id da página: reimportar reconhece a mesma página.
    if cur.id is null and ext ~* '^[0-9a-f]{32}$' then
      select * into cur from public.pages p where p.id = ext::uuid and p.workspace_id = p_workspace and not p.is_archived;
    end if;

    if cur.id is not null then
      if p_mode <> 'update' then
        external_id := ext; page_id := cur.id; action := 'skipped';
        return next;
        continue;
      end if;
      insert into public.import_changes(import_id, page_id, action, before)
      values (p_import, cur.id, 'updated', jsonb_build_object('title', cur.title, 'row_properties', cur.row_properties, 'content_json', cur.content_json))
      on conflict do nothing;
      update public.pages p set
        title = coalesce(r->>'title', p.title),
        icon = coalesce(r->>'icon', p.icon),
        row_properties = p.row_properties || coalesce(r->'row_properties', '{}'::jsonb),
        import_id = p_import
      where p.id = cur.id;
      external_id := ext; page_id := cur.id; action := 'updated';
      return next;
      continue;
    end if;

    insert into public.pages(workspace_id, parent_id, title, icon, position, is_database, database_schema, row_properties, external_source, external_id, import_id)
    values (
      p_workspace, nullif(r->>'parent_id', '')::uuid, coalesce(r->>'title', ''), r->>'icon', coalesce((r->>'position')::double precision, 0),
      coalesce((r->>'is_database')::boolean, false), coalesce(r->'database_schema', '[]'::jsonb), coalesce(r->'row_properties', '{}'::jsonb),
      src, ext, p_import
    ) returning id into made;
    insert into public.import_changes(import_id, page_id, action) values (p_import, made, 'created');
    external_id := ext; page_id := made; action := 'created';
    return next;
  end loop;
end $$;

-- Guarda o estado de uma página que a importação vai alterar sem ter criado.
create or replace function public.import_snapshot(p_import uuid, p_page uuid) returns void
language sql security invoker set search_path = public as $$
  insert into public.import_changes(import_id, page_id, action, before)
  select p_import, p.id, 'updated', jsonb_build_object('title', p.title, 'row_properties', p.row_properties, 'content_json', p.content_json)
  from public.pages p where p.id = p_page
  on conflict do nothing
$$;

-- Alteração feita pelo sistema, sem gerar aviso nem e-mail. Usada também por "Mover linhas para Tarefas".
create or replace function public.quiet_update(p_page uuid, p_patch jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  perform set_config('app.importing', '1', true);
  update public.pages p set
    parent_id = case when p_patch ? 'parent_id' then nullif(p_patch->>'parent_id', '')::uuid else p.parent_id end,
    row_properties = coalesce(p_patch->'row_properties', p.row_properties),
    content_json = coalesce(p_patch->'content_json', p.content_json),
    database_schema = coalesce(p_patch->'database_schema', p.database_schema)
  where p.id = p_page;
  if not found then raise exception 'Sem permissão para editar.' using errcode = '42501'; end if;
end $$;

-- O que foi criado vai para a lixeira; o que foi atualizado volta ao estado anterior.
create or replace function public.undo_import(p_import uuid) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  c public.import_changes;
  total integer := 0;
begin
  if not exists (select 1 from public.imports where id = p_import and undone_at is null) then
    raise exception 'Importação não encontrada ou já desfeita.' using errcode = '42501';
  end if;
  perform set_config('app.importing', '1', true);
  for c in select * from public.import_changes where import_id = p_import loop
    if c.action = 'created' then
      update public.pages set is_archived = true where id = c.page_id;
    else
      update public.pages set
        title = c.before->>'title', row_properties = c.before->'row_properties', content_json = c.before->'content_json'
      where id = c.page_id;
    end if;
    total := total + 1;
  end loop;
  update public.imports set undone_at = now() where id = p_import;
  return total;
end $$;

-- Imagens das páginas importadas. Nome aleatório, como as capas: quem tem o link abre.
insert into storage.buckets (id, name, public, file_size_limit)
values ('page-media', 'page-media', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit;

create policy "page-media: membros enviam" on storage.objects for insert to authenticated
  with check (bucket_id = 'page-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "page-media: leitura" on storage.objects for select to authenticated
  using (bucket_id = 'page-media');

revoke execute on function public.import_pages(uuid, uuid, text, jsonb) from public, anon;
revoke execute on function public.import_snapshot(uuid, uuid) from public, anon;
revoke execute on function public.quiet_update(uuid, jsonb) from public, anon;
revoke execute on function public.undo_import(uuid) from public, anon;
grant execute on function public.import_pages(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.import_snapshot(uuid, uuid) to authenticated;
grant execute on function public.quiet_update(uuid, jsonb) to authenticated;
grant execute on function public.undo_import(uuid) to authenticated;
