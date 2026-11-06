-- Papel de administrador: edita tudo e gerencia o time. Só o dono define quem é administrador.
alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members add constraint workspace_members_role_check check (role in ('admin', 'editor', 'viewer'));

-- Sem isto o administrador perderia o direito de editar: a regra antiga só aceitava 'editor'.
create or replace function public.my_workspace_ids(only_editable boolean default false) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.workspaces where owner_id = auth.uid()
  union
  select workspace_id from public.workspace_members
  where user_id = auth.uid() and (not only_editable or role in ('admin', 'editor'))
$$;

create or replace function public.is_team_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspaces where id = public.team_workspace_id() and owner_id = auth.uid())
$$;

create or replace function public.is_team_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_team_owner() or exists (
    select 1 from public.workspace_members
    where workspace_id = public.team_workspace_id() and user_id = auth.uid() and role = 'admin'
  )
$$;

-- Políticas novas somam às do dono. A tabela de membros fica de fora de propósito: o administrador
-- só mexe nela pelas funções abaixo, que impedem promover alguém ou mexer em outro administrador.
create policy "invites: administrador gerencia" on public.invites for all
  using (public.is_team_manager() and workspace_id = public.team_workspace_id())
  with check (public.is_team_manager() and workspace_id = public.team_workspace_id());
create policy "shares: administrador gerencia" on public.page_shares for all
  using (public.is_team_manager() and exists (select 1 from public.pages p where p.id = page_id and p.workspace_id = public.team_workspace_id()))
  with check (public.is_team_manager() and exists (select 1 from public.pages p where p.id = page_id and p.workspace_id = public.team_workspace_id()));

create or replace function public.team_members() returns table (id uuid, name text, email text, role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.email, 'owner'
  from public.workspaces w join public.profiles p on p.id = w.owner_id
  where w.id = public.team_workspace_id() and w.id in (select public.my_workspace_ids())
  union all
  select p.id, p.name, p.email, m.role
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  join public.profiles p on p.id = m.user_id
  where w.id = public.team_workspace_id() and w.id in (select public.my_workspace_ids()) and m.user_id <> w.owner_id
$$;

-- Mudar ou remover alguém passa pelas mesmas travas.
create or replace function public.check_can_manage(p_user uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  team uuid := public.team_workspace_id();
  current_role_of text;
begin
  if not public.is_team_manager() then
    raise exception 'Só administradores gerenciam o time.' using errcode = '42501';
  end if;
  if exists (select 1 from public.workspaces where id = team and owner_id = p_user) then
    raise exception 'O dono do time não pode ser alterado.' using errcode = '42501';
  end if;
  select role into current_role_of from public.workspace_members where workspace_id = team and user_id = p_user;
  if current_role_of is null then raise exception 'Pessoa fora do time.'; end if;
  if current_role_of = 'admin' and not public.is_team_owner() then
    raise exception 'Só o dono define administradores.' using errcode = '42501';
  end if;
  return current_role_of;
end $$;

create or replace function public.set_member_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_role not in ('admin', 'editor', 'viewer') then raise exception 'Papel inválido.'; end if;
  perform public.check_can_manage(p_user);
  if p_role = 'admin' and not public.is_team_owner() then
    raise exception 'Só o dono define administradores.' using errcode = '42501';
  end if;
  update public.workspace_members set role = p_role where workspace_id = public.team_workspace_id() and user_id = p_user;
end $$;

create or replace function public.remove_member(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.check_can_manage(p_user);
  delete from public.workspace_members where workspace_id = public.team_workspace_id() and user_id = p_user;
end $$;

create or replace function public.invite_by_email(p_workspace uuid, p_page uuid, p_email text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  mail text := lower(trim(p_email));
  is_owner boolean := exists (select 1 from public.workspaces where id = p_workspace and owner_id = auth.uid());
begin
  if not is_owner and not (p_workspace = public.team_workspace_id() and public.is_team_manager()) then
    raise exception 'Só o dono ou um administrador pode convidar.' using errcode = '42501';
  end if;
  if p_role not in ('editor', 'viewer') then raise exception 'Papel inválido.'; end if;
  if p_page is not null and not exists (select 1 from public.pages where id = p_page and workspace_id = p_workspace) then
    raise exception 'Página de outro workspace.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.allowed_emails where email = mail) then
    if not (public.is_app_admin() or public.is_team_manager()) then
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
    -- Convidar de novo não pode virar um atalho para rebaixar o dono ou outro administrador.
    if exists (select 1 from public.workspaces where id = p_workspace and owner_id = target) then
      raise exception 'O dono do time não pode ser alterado.' using errcode = '42501';
    end if;
    if not is_owner and exists (select 1 from public.workspace_members where workspace_id = p_workspace and user_id = target and role = 'admin') then
      raise exception 'Só o dono define administradores.' using errcode = '42501';
    end if;
    insert into public.workspace_members(workspace_id, user_id, role) values (p_workspace, target, p_role)
    on conflict (workspace_id, user_id) do update set role = excluded.role;
  else
    insert into public.page_shares(page_id, user_id, role) values (p_page, target, p_role)
    on conflict (page_id, user_id) do update set role = excluded.role;
  end if;
  return 'added';
end $$;

revoke execute on function public.team_members() from public, anon;
revoke execute on function public.check_can_manage(uuid) from public, anon, authenticated;
revoke execute on function public.set_member_role(uuid, text) from public, anon;
revoke execute on function public.remove_member(uuid) from public, anon;
grant execute on function public.team_members() to authenticated;
grant execute on function public.set_member_role(uuid, text) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
