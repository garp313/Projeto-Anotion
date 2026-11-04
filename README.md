# Notion Clone

1. `npm install`
2. Crie um projeto no Supabase e rode, nesta ordem, no SQL Editor:
   as migrations de `supabase/migrations/`, de `0001` a `0006`.
3. Copie `.env.example` para `.env.local` e preencha URL e anon key.
4. (Dev) Em Authentication > Providers > Email, desative "Confirm email" para entrar logo após o cadastro.
   Com convites em uso, deixe ativado: sem confirmação, quem criar conta com o e-mail convidado recebe o acesso.
5. `npm run dev` e abra http://localhost:3000

## Google

- No Supabase, ative o provedor Google e inclua `http://localhost:3000/auth/callback` em Redirect URLs.
- No Google Cloud, autorize a URI `https://<projeto>.supabase.co/auth/v1/callback` e os escopos
  `calendar` e `gmail.send`. Enquanto o app estiver em teste, cada pessoa precisa ser usuário de teste.
- Obrigatório para conectar Agenda e Gmail: `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env.local` (os mesmos do provedor Google no Supabase).
  No cliente OAuth do Google, autorize também a URI `http://localhost:3000/api/google/callback` e a equivalente da produção.
  Conectar o Google não troca quem está logado no app.

Avisos por e-mail saem do Gmail de quem fez a ação, se essa pessoa tiver conectado o Google.
Prazos e lembretes aparecem só no Inbox.

## Atalhos

`/` comandos · `@` pessoa, página ou data · `Ctrl+K` busca · `Ctrl+\` recolhe a barra lateral
