// Conversa num formato neutro: vira o formato da Anthropic ou do Google só na hora de chamar.

export type Provider = "claude" | "gemini";

export const PROVIDER_LABEL: Record<Provider, string> = { claude: "Claude", gemini: "Gemini" };

/** Modelo usado quando a pessoa não escolhe outro. */
export const DEFAULT_MODEL: Record<Provider, string> = { claude: "claude-sonnet-5-5", gemini: "gemini-2.5-flash" };

export type ToolCall = {
  id: string;
  name: string;
  args: Record<string, any>;
  /** Assinatura opaca do Gemini: precisa voltar junto com a chamada. */
  sig?: string;
  /** O id veio do Gemini: a resposta da ferramenta repete o id. */
  native?: boolean;
};

export type ToolResult = { id: string; name: string; output: string };

export type ChatMsg =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; calls?: ToolCall[]; raw?: any[] }
  | { role: "tool"; results: ToolResult[] };

export type KeyStatus = { model: string; hint: string } | null;

export type KeysResponse = {
  /** O servidor tem TOKEN_ENC_KEY para guardar chaves? */
  ready: boolean;
  /** A migration 0017 já foi rodada? */
  migrated: boolean;
  keys: Record<Provider, KeyStatus>;
};

export type ChatResponse = {
  messages: ChatMsg[];
  /** A última resposta pede para criar ou alterar algo: espera Aplicar ou Descartar. */
  pending: string[] | null;
  /** Algo foi gravado: a tela recarrega os dados. */
  changed: boolean;
  /** Linhas com data gravada: a tela tenta levar para a agenda do Google, se o banco sincroniza. */
  dated?: string[];
  error?: string;
};

/** Chamadas que esperam a confirmação de quem usa: alteram dados. */
export const WRITE_TOOLS = new Set([
  "criar_pagina", "criar_banco", "adicionar_colunas", "adicionar_linhas", "editar_linhas", "escrever_na_pagina",
]);

/** Como a consulta aparece na conversa. */
export const READ_LABEL: Record<string, string> = {
  buscar: "Buscou páginas",
  ler_pagina: "Leu uma página",
  listar_linhas: "Leu as linhas de um banco",
  listar_membros: "Viu os membros do time",
};

/** Mensagens pendentes: a última do assistente tem alterações ainda sem resposta. */
export function pendingCalls(messages: ChatMsg[]): ToolCall[] {
  const last = messages[messages.length - 1];
  return last?.role === "assistant" && last.calls?.some((c) => WRITE_TOOLS.has(c.name)) ? last.calls : [];
}
