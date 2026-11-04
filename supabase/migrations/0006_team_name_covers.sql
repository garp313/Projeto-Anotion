-- Nome do time e imagens de capa enviadas pelas pessoas.
update public.workspaces set name = 'Plan. Logístico';

-- Bucket público: a capa aparece em qualquer tela sem gerar link temporário.
-- Quem tiver o endereço da imagem consegue abrir, por isso capas não devem ter dado sensível.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "covers: membros enviam" on storage.objects for insert to authenticated
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "covers: autor apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
-- O envio lê de volta a linha criada. O bucket já é público: isso não expõe nada novo.
create policy "covers: leitura" on storage.objects for select to authenticated
  using (bucket_id = 'covers');
