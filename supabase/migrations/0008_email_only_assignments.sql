-- Por e-mail vai só a atribuição de tarefa. Menção, comentário e status seguem apenas no Inbox.
create or replace function public.pending_emails()
returns table (id uuid, email text, body text, page_id uuid)
language sql stable security definer set search_path = public as $$
  select n.id, p.email, n.body, n.page_id
  from public.notifications n join public.profiles p on p.id = n.user_id
  where n.actor_id = auth.uid() and n.emailed_at is null and n.kind = 'assigned'
    and n.created_at > now() - interval '1 hour'
  order by n.created_at limit 20
$$;
