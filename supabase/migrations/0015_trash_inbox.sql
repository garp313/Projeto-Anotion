-- Lixeira e Inbox. Só soma regras: nada do que já vale deixa de valer.

-- Arquivar uma notificação tira ela da Inbox sem apagar: a aba "Arquivadas" ainda mostra.
-- O destinatário já podia alterar as próprias notificações (política de 0003).
alter table public.notifications add column if not exists archived_at timestamptz;

-- Apagar de vez: antes só o dono do workspace podia. Agora o administrador apaga o que está na
-- lixeira do time, e cada pessoa apaga o que ela mesma criou e já mandou para a lixeira.
-- Página fora da lixeira continua protegida: primeiro ela precisa ser arquivada.
create policy "pages: administrador ou autor apaga da lixeira" on public.pages for delete
  using (
    is_archived
    and workspace_id in (select public.my_workspace_ids(true))
    and (public.is_team_manager() or created_by = auth.uid())
  );
