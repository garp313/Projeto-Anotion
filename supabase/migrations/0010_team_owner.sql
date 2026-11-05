-- Garante que o workspace do time pertence ao administrador. Pode rodar mais de uma vez.
do $$
declare
  admin_email constant text := 'estevao.silva@usereserva.com';
  admin_id uuid;
  team uuid;
  old_owner uuid;
begin
  select id into admin_id from auth.users where lower(email) = admin_email;
  if admin_id is null then
    raise exception 'A conta % não existe neste banco. Entre com ela uma vez no app e rode de novo.', admin_email;
  end if;

  -- O workspace do time é o que tem as páginas, seja qual for o dono atual.
  select w.id, w.owner_id into team, old_owner
  from public.workspaces w
  left join public.pages p on p.workspace_id = w.id
  group by w.id, w.owner_id, w.created_at
  order by count(p.id) desc, w.created_at
  limit 1;

  if old_owner <> admin_id then
    update public.workspaces set owner_id = admin_id where id = team;
    insert into public.workspace_members(workspace_id, user_id, role) values (team, old_owner, 'editor')
    on conflict (workspace_id, user_id) do nothing;
  end if;
  -- O dono não aparece como membro: tem acesso total pela posse do workspace.
  delete from public.workspace_members where workspace_id = team and user_id = admin_id;

  insert into public.allowed_emails(email) values (admin_email) on conflict (email) do nothing;
  update public.allowed_emails set is_admin = (email = admin_email);
end $$;

-- Mesma regra da 0005: o time é o workspace do administrador, independente de qual versão rodou.
create or replace function public.team_workspace_id() returns uuid
language sql stable security definer set search_path = public as $$
  select w.id from public.workspaces w
  join auth.users u on u.id = w.owner_id
  join public.allowed_emails a on a.email = lower(u.email) and a.is_admin
  order by w.created_at, w.id limit 1
$$;
