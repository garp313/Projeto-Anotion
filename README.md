# Notion Clone

1. `npm install`
2. Crie um projeto no Supabase e rode, nesta ordem, no SQL Editor:
   as migrations de `supabase/migrations/`, de `0001` a `0005`.
3. Copie `.env.example` para `.env.local` e preencha URL e anon key.
4. (Dev) Em Authentication > Providers > Email, desative "Confirm email" para entrar logo após o cadastro.
   Com convites em uso, deixe ativado: sem confirmação, quem criar conta com o e-mail convidado recebe o acesso.
5. `npm run dev` e abra http://localhost:3000

## Google

- No Supabase, ative o provedor Google e inclua `http://localhost:3000/auth/callback` em Redirect URLs.
- No Google Cloud, autorize a URI `https://<projeto>.supabase.co/auth/v1/callback` e os escopos
  `calendar` e `gmail.send`. Enquanto o app estiver em teste, cada pessoa precisa ser usuário de teste.
- Opcional: `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env.local` mantêm a conexão além de 1 hora.

Avisos por e-mail saem do Gmail de quem fez a ação, se essa pessoa tiver conectado o Google.
Prazos e lembretes aparecem só no Inbox.

## Atalhos

`/` comandos · `@` pessoa, página ou data · `Ctrl+K` busca · `Ctrl+\` recolhe a barra lateral
