-- Automações de banco: avisos no Inbox (e por e-mail, se a regra pedir) criados por quem fez a alteração.
-- As regras ficam em pages.row_properties.__automations do banco; aqui só a função que cria o aviso.
create or replace function public.automation_notify(p_page uuid, p_targets uuid[], p_message text, p_email boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  who uuid;
  n integer := 0;
begin
  if me is null then raise exception 'Sem sessão.' using errcode = '42501'; end if;
  -- Só quem pode editar a linha dispara aviso sobre ela.
  if not exists (
    select 1 from public.pages p
    where p.id = p_page
      and (p.workspace_id in (select public.my_workspace_ids(true)) or p.id in (select public.my_shared_page_ids(true)))
  ) then
    raise exception 'Sem permissão para editar.' using errcode = '42501';
  end if;
  foreach who in array coalesce(p_targets, '{}'::uuid[]) loop
    -- Só pessoas do time, e ninguém recebe aviso da própria ação.
    if who is null or who = me or who not in (select public.my_coworker_ids()) then continue; end if;
    -- Sem e-mail: já nasce marcado como enviado, e a fila de e-mails o ignora.
    insert into public.notifications(user_id, actor_id, kind, page_id, body, emailed_at)
    values (who, me, 'status', p_page, left(coalesce(p_message, ''), 300), case when p_email then null else now() end);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.automation_notify(uuid, uuid[], text, boolean) from public, anon;
grant execute on function public.automation_notify(uuid, uuid[], text, boolean) to authenticated;
