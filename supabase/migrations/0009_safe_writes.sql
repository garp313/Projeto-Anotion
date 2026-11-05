-- Gravação segura para o time: duas pessoas na mesma página não apagam o trabalho uma da outra.

-- Grava só uma propriedade. Antes a linha inteira era gravada a partir do que estava na tela,
-- então quem mudava o prazo desfazia o status que a colega tinha acabado de mudar.
-- security invoker: passa pelo RLS, e "not found" revela quem não tem permissão de editar.
create or replace function public.set_row_prop(p_page uuid, p_key text, p_value jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update public.pages
  set row_properties = case
    when p_value is null or p_value = 'null'::jsonb then row_properties - p_key
    else row_properties || jsonb_build_object(p_key, p_value)
  end
  where id = p_page;
  if not found then raise exception 'Sem permissão para editar.' using errcode = '42501'; end if;
end $$;

-- Versão do texto da página: salvar exige estar em cima da última versão.
alter table public.pages add column if not exists content_rev bigint not null default 0;

create or replace function public.bump_content_rev() returns trigger
language plpgsql as $$
begin
  if new.content_json is distinct from old.content_json then new.content_rev = old.content_rev + 1; end if;
  return new;
end $$;

create trigger pages_content_rev before update on public.pages
for each row execute function public.bump_content_rev();

-- p_base nulo força a gravação: é a escolha "manter a minha versão" depois de um conflito.
create or replace function public.save_content(p_page uuid, p_content jsonb, p_base bigint) returns bigint
language plpgsql security invoker set search_path = public as $$
declare
  saved bigint;
  current_rev bigint;
begin
  update public.pages set content_json = p_content
  where id = p_page and (p_base is null or content_rev = p_base)
  returning content_rev into saved;
  if saved is not null then return saved; end if;

  select content_rev into current_rev from public.pages where id = p_page;
  if current_rev is null or current_rev = p_base then
    raise exception 'Sem permissão para editar.' using errcode = '42501';
  end if;
  raise exception 'Outra pessoa alterou esta página.' using errcode = '40001';
end $$;

revoke execute on function public.set_row_prop(uuid, text, jsonb) from public, anon;
revoke execute on function public.save_content(uuid, jsonb, bigint) from public, anon;
grant execute on function public.set_row_prop(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.save_content(uuid, jsonb, bigint) to authenticated, service_role;
