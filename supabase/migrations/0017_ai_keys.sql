-- Assistente de IA: cada pessoa guarda a própria chave da Anthropic (Claude) ou do Google (Gemini).
-- A chave fica cifrada com TOKEN_ENC_KEY, que só o servidor conhece. Só a dona da chave vê a linha.
create table if not exists public.ai_keys (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null check (provider in ('claude', 'gemini')),
  key_enc text not null,
  key_hint text not null default '',
  model text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.ai_keys enable row level security;

drop policy if exists "ai_keys: a própria pessoa" on public.ai_keys;
create policy "ai_keys: a própria pessoa" on public.ai_keys for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.ai_keys from anon;
grant select, insert, update, delete on public.ai_keys to authenticated;
