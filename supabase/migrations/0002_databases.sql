-- Autoria, ID sequencial e arquivos das propriedades de banco de dados.
-- As visões salvas não dependem desta migration: ficam em row_properties.__views.
alter table public.pages
  add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null,
  add column if not exists last_edited_by uuid default auth.uid() references auth.users(id) on delete set null,
  add column if not exists seq bigserial;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  new.last_edited_by = coalesce(auth.uid(), new.last_edited_by);
  return new;
end $$;

-- Linhas de um banco são buscadas por pai; o índice parcial evita varrer as arquivadas.
create index if not exists pages_rows_idx on public.pages(parent_id, position) where is_archived = false;

-- Propriedade "Arquivos e mídia": bucket privado, cada usuário só acessa a própria pasta.
insert into storage.buckets (id, name, public) values ('files', 'files', false)
on conflict (id) do nothing;

create policy "files: dono lê" on storage.objects for select
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "files: dono envia" on storage.objects for insert
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "files: dono apaga" on storage.objects for delete
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
