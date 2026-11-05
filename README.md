# Notion Clone

1. `npm install`
2. Crie um projeto no Supabase e rode, nesta ordem, no SQL Editor:
   as migrations de `supabase/migrations/`, de `0001` a `0010`.
3. Copie `.env.example` para `.env.local` e preencha URL e anon key.
4. Em Authentication > Providers > Email, mantenha "Confirm email" ativado. Quem tem e-mail @usereserva.com entra
   sem convite, então sem confirmação qualquer um se cadastraria com um endereço que não é dele.
5. `npm run dev` e abra http://localhost:3000

## Google

- No Supabase, ative o provedor Google e inclua `http://localhost:3000/auth/callback` em Redirect URLs.
- No Google Cloud, autorize a URI `https://<projeto>.supabase.co/auth/v1/callback` e os escopos
  `calendar` e `gmail.send`. Enquanto o app estiver em teste, cada pessoa precisa ser usuário de teste.
- Obrigatório para conectar Agenda e Gmail: `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env.local` (os mesmos do provedor Google no Supabase).
  No cliente OAuth do Google, autorize também a URI `http://localhost:3000/api/google/callback` e a equivalente da produção.
  Conectar o Google não troca quem está logado no app.

Só o convite e a atribuição de tarefa vão por e-mail, pelo Gmail de quem fez a ação (a pessoa precisa ter conectado o Google).
Menções, comentários, status e prazos aparecem só no Inbox.

## Atalhos

`/` comandos · `@` pessoa, página ou data · `Ctrl+K` busca · `Ctrl+\` recolhe a barra lateral
