# Projeto-Anotion — Clone do Notion

Clone moderno do Notion desenvolvido com **Next.js 15**, **React 19**, **Supabase** e **Tailwind CSS**, reproduzindo a experiência visual, velocidade e fluxo de trabalho do aplicativo oficial.

---

## 🚀 Principais Funcionalidades

### 📝 Editor de Blocos Avançado
- Baseado em `@blocknote/react` (motor Prosemirror/Tiptap ultra-fiel).
- Menu slash (`/`) com atalhos de Markdown (`#`, `-`, `[]`).
- Blocos customizados: Callouts com emoji interativo, Divisores, Títulos, Listas de tarefas e Código.
- Auto-save contínuo com debounce de 800ms.

### 📊 Bancos de Dados & Coleções Relacionais
- Múltiplas visualizações: **Tabela**, **Quadro (Kanban)** e **Lista**.
- Modelo Notion puro: cada linha da database é também uma página completa.
- **Livre poder de edição de colunas**: renomeação direta, troca de tipos e reordenação.
- Tipos de propriedades suportados:
  - Texto, Número, Seleção, Múltipla seleção, Status, Data, Pessoa, Arquivos & Mídia, Checkbox, URL, Telefone, E-mail, Relação, Rollup, Fórmula e Botão.
- Paleta oficial do Notion com 9 opções de cores para tags e seleções.

### 📖 Visualização Lateral (*Side Peek*) & Modal Central
- Abra qualquer linha/projeto em painel lateral dividido (*Split Screen*) ou janela flutuante (*Center Modal*).
- Anotações aprofundadas com editor de blocos completo para cada item.
- Lista vertical de propriedades do banco de dados e botão `+ Adicionar uma propriedade`.
- Seção interativa de comentários.

### 🗂️ Barra Lateral & Navegação
- Árvore infinita de páginas e subpáginas recursivas.
- **Drag-and-Drop**: reordene páginas e mova itens para dentro/fora de subníveis com o mouse.
- Barra lateral redimensionável (arraste a borda direita) com memória de largura persistente.
- Atalho global `Ctrl+\` (ou `Cmd+\`) para recolher/expandir a sidebar.
- **Busca rápida global (`Ctrl+K` / `Cmd+K`)**: pesquisa instantânea estilo Spotlight com navegação por teclado.

### 🔒 Autenticação Google Corporativa & Segurança
- Login oficial com **Google OAuth** e credenciais de e-mail/senha.
- **Restrição estrita a e-mails corporativos**: bloqueia provedores gratuitos/pessoais (`@gmail.com`, `@hotmail.com`, etc.).
- Suporte a variável de ambiente `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS` para travar o login exclusivamente no domínio da sua empresa.
- Proteção de rotas SSR via Middleware e Row Level Security (RLS) no PostgreSQL do Supabase.

---

## 🛠️ Tecnologias Utilizadas
- **Framework**: Next.js 15.5 (App Router, React 19, TypeScript)
- **Editor**: `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine` v0.35
- **Backend & Auth**: Supabase (`@supabase/ssr` e `@supabase/supabase-js`)
- **Estilização**: Tailwind CSS v4 com design tokens oficiais do Notion
- **Gerenciamento de Estado**: Zustand & `@tanstack/react-query` v5

---

## ⚙️ Como Executar Localmente

### 1. Clonar o repositório
```bash
git clone https://github.com/garp313/Projeto-Anotion.git
cd Projeto-Anotion
```

### 2. Instalar dependências
```bash
npm install
```

### 3. Configurar variáveis de ambiente
Copie o arquivo `.env.example` para `.env.local`:
```bash
cp .env.example .env.local
```
Preencha com as credenciais do seu projeto Supabase:
```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key-aqui

# (Opcional) Restringir login do Google e manual aos domínios da empresa:
# NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS=suaempresa.com.br
```

### 4. Executar as Migrações do Banco
No painel do Supabase, acesse o **SQL Editor** e execute o script em:
`supabase/migrations/0001_init.sql`

### 5. Iniciar o servidor de desenvolvimento
```bash
npm run dev
```
Acesse [http://localhost:3000](http://localhost:3000) no seu navegador.
