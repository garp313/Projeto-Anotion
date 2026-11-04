-- Um único workspace para o time inteiro: quem entra vê as mesmas páginas.
-- O workspace do administrador vira o do time, e as páginas dos outros são trazidas para ele.
-- Para trocar o administrador do time, troque o e-mail abaixo antes de rodar.
do $$
declare admin_email constant text := 'estevao.silva@usereserva.com';
begin
  if to_regclass('public.allowed_emails') is null then
    raise exception 'Rode a migration 0004_google.sql antes desta.';
  end if;
  -- Banco com contas e sem esta: parar é melhor que entregar o time à conta errada.
  if exists (select 1 from auth.users) and not exists (
    select 1 from public.workspaces w join auth.users u on u.id = w.owner_id where lower(u.email) = admin_email
  ) then
    raise exception 'A conta % não tem workspace neste banco. Entre com ela uma vez no app e rode de novo.', admin_email;
  end if;
  insert into public.allowed_emails(email) values (admin_email) on conflict (email) do nothing;
  update public.allowed_emails set is_admin = (email = admin_email);
end $$;

create or replace function public.team_workspace_id() returns uuid
language sql stable security definer set search_path = public as $$
  select w.id from public.workspaces w
  join auth.users u on u.id = w.owner_id
  join public.allowed_emails a on a.email = lower(u.email) and a.is_admin
  order by w.created_at, w.id limit 1
$$;

-- "Bem-vindo" vazio criado para cada conta: no time bastaria um, os demais vão para a lixeira.
update public.pages p set is_archived = true
where p.workspace_id <> public.team_workspace_id()
  and p.parent_id is null and p.title = 'Bem-vindo' and p.content_json = '[]'::jsonb;

update public.pages set workspace_id = public.team_workspace_id()
where workspace_id <> public.team_workspace_id();

-- Todos viram membros do time. Quem era leitor em algum workspace continua leitor.
insert into public.workspace_members(workspace_id, user_id, role)
select public.team_workspace_id(), u.id,
  coalesce((select m.role from public.workspace_members m where m.user_id = u.id order by m.role desc limit 1), 'editor')
from auth.users u
where u.id <> (select owner_id from public.workspaces where id = public.team_workspace_id())
on conflict (workspace_id, user_id) do nothing;

-- Sem páginas, os workspaces antigos podem sair. O "not exists" garante que nada seja apagado junto.
delete from public.workspaces w
where w.id <> public.team_workspace_id()
  and not exists (select 1 from public.pages p where p.workspace_id = w.id);

-- Conta nova entra no time com o papel do convite. Só o administrador, em banco vazio, cria o workspace.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  team uuid := public.team_workspace_id();
  invited text;
begin
  if team is null then
    insert into public.workspaces(name, owner_id) values ('Workspace do time', new.id) returning id into team;
    insert into public.pages(workspace_id, title, icon, position) values (team, 'Bem-vindo', '👋', 1);
    return new;
  end if;
  select role into invited from public.invites
  where workspace_id = team and page_id is null and lower(email) = lower(new.email) limit 1;
  insert into public.workspace_members(workspace_id, user_id, role)
  values (team, new.id, coalesce(invited, 'editor'))
  on conflict (workspace_id, user_id) do nothing;
  delete from public.invites where workspace_id = team and page_id is null and lower(email) = lower(new.email);
  return new;
end $$;

revoke execute on function public.team_workspace_id() from public, anon;
grant execute on function public.team_workspace_id() to authenticated;
