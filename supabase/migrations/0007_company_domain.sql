-- Quem tem e-mail da empresa entra sem convite. A lista allowed_emails continua valendo para exceções.
-- Exige "Confirm email" ligado no Supabase: sem isso, qualquer um se cadastra com um endereço que não é dele.
create or replace function public.require_allowed_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lower(coalesce(new.email, '')) ~ '^[^@\s]+@usereserva\.com$' then return new; end if;
  if new.email is null or not exists (select 1 from public.allowed_emails where email = lower(new.email)) then
    raise exception 'E-mail fora da empresa.' using errcode = '42501';
  end if;
  return new;
end $$;
