// Chamadas diretas às APIs, sem SDK: a conversa neutra vira o formato de cada provedor.
import { randomUUID } from "crypto";
import type { ToolDef } from "./tools";
import type { ChatMsg, Provider, ToolCall } from "./types";

/** `raw`: partes do Gemini como vieram. Ele exige recebê-las de volta sem mudança (assinaturas). */
export type Reply = { text: string; calls: ToolCall[]; raw?: any[]; model?: string };

/** Erro que pode ser mostrado a quem usa. */
export class ProviderError extends Error {
  /** Modelo que o provedor indicou no lugar de um desativado. */
  replacement?: string;
  constructor(message: string, public status = 502) { super(message); }
}

const TIMEOUT = 50_000;

async function post(url: string, headers: Record<string, string>, body: unknown, provider: Provider) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT),
      headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
    });
  } catch {
    throw new ProviderError("A IA demorou demais para responder. Tente de novo.", 504);
  }
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;
  const name = provider === "claude" ? "A Anthropic" : "O Google";
  const detail = String(data?.error?.message ?? "").slice(0, 200);
  if (res.status === 401 || res.status === 403 || /api key|API_KEY/i.test(detail)) throw new ProviderError(`${name} recusou a chave. Confira nas configurações do assistente.`, 401);
  if (res.status === 429) throw new ProviderError(`${name} avisou que o limite de uso foi atingido. Espere um pouco ou confira o saldo da conta.`, 429);
  if (res.status === 404) {
    const err = new ProviderError(`Modelo não encontrado. Confira o nome do modelo nas configurações.${detail ? ` (${detail})` : ""}`, 400);
    // "This model ... is no longer available ... Please update your code to use models/gemini-x".
    err.replacement = /no longer available[\s\S]*?use (?:models\/)?([a-z0-9][\w.-]*[a-z0-9])/i.exec(String(data?.error?.message ?? ""))?.[1];
    throw err;
  }
  if (res.status === 400 && /credit|balance|billing/i.test(detail)) throw new ProviderError(`${name} avisou que falta saldo na conta da API.`, 402);
  console.error("ai provider", provider, res.status, detail);
  throw new ProviderError(`${name} respondeu com erro (${res.status}).${detail ? ` ${detail}` : ""}`);
}

// ---------------------------------------------------------------- Claude

/** As duas APIs pedem papéis alternados: mensagens seguidas do mesmo papel viram uma. */
function merge<T extends { role: string }>(list: T[], key: keyof T): T[] {
  const out: T[] = [];
  for (const m of list) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) (last[key] as any) = [...(last[key] as any), ...(m[key] as any)];
    else out.push({ ...m });
  }
  return out;
}

function toClaude(messages: ChatMsg[]) {
  return merge(messages.map((m) => {
    if (m.role === "user") return { role: "user", content: [{ type: "text", text: m.text }] as any[] };
    if (m.role === "tool") return { role: "user", content: m.results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.output })) };
    const content: any[] = [];
    if (m.text) content.push({ type: "text", text: m.text });
    for (const c of m.calls ?? []) content.push({ type: "tool_use", id: c.id, name: c.name, input: c.args ?? {} });
    return { role: "assistant", content: content.length ? content : [{ type: "text", text: "…" }] };
  }), "content");
}

async function claude(key: string, model: string, system: string, messages: ChatMsg[], tools: ToolDef[]): Promise<Reply> {
  const data = await post("https://api.anthropic.com/v1/messages", { "x-api-key": key, "anthropic-version": "2023-06-01" }, {
    model, max_tokens: 4096, system,
    tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
    messages: toClaude(messages),
  }, "claude");
  const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
  return {
    text: blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim(),
    calls: blocks.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, args: b.input ?? {} })),
  };
}

// ---------------------------------------------------------------- Gemini

/** O Gemini usa o esquema OpenAPI com os tipos em maiúsculas. */
function geminiSchema(s: any): any {
  if (!s || typeof s !== "object") return s;
  const out: any = { ...s, type: String(s.type).toUpperCase() };
  if (s.items) out.items = geminiSchema(s.items);
  if (s.properties) {
    out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, geminiSchema(v)]));
    if (!Object.keys(out.properties).length) { delete out.properties; delete out.required; }
  }
  if (Array.isArray(out.required) && !out.required.length) delete out.required;
  return out;
}

function toGemini(messages: ChatMsg[]) {
  const calls = new Map<string, ToolCall>();
  for (const m of messages) if (m.role === "assistant") for (const c of m.calls ?? []) calls.set(c.id, c);
  return merge(messages.map((m) => {
    if (m.role === "user") return { role: "user", parts: [{ text: m.text }] };
    if (m.role === "tool") {
      return {
        role: "user",
        parts: m.results.map((r) => {
          let response: unknown;
          try { response = JSON.parse(r.output); } catch { response = r.output; }
          const call = calls.get(r.id);
          return { functionResponse: { ...(call?.native ? { id: r.id } : {}), name: call?.name ?? r.name, response: { resultado: response } } };
        }),
      };
    }
    if (m.raw?.length) return { role: "model", parts: m.raw };
    const parts: any[] = [];
    if (m.text) parts.push({ text: m.text });
    for (const c of m.calls ?? []) {
      parts.push({ functionCall: { name: c.name, args: c.args ?? {} }, ...(c.sig ? { thoughtSignature: c.sig } : {}) });
    }
    return { role: "model", parts: parts.length ? parts : [{ text: "…" }] };
  }), "parts");
}

async function gemini(key: string, model: string, system: string, messages: ChatMsg[], tools: ToolDef[]): Promise<Reply> {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: toGemini(messages),
    tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: geminiSchema(t.parameters) })) }],
    generationConfig: { maxOutputTokens: 8192 },
  };
  const url = (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;
  let data: any;
  let used: string | undefined;
  try {
    data = await post(url(model), { "x-goog-api-key": key }, body, "gemini");
  } catch (e) {
    // O Google desativa modelos e indica o substituto: tenta uma vez com ele.
    if (!(e instanceof ProviderError) || !e.replacement || e.replacement === model) throw e;
    used = e.replacement;
    data = await post(url(used), { "x-goog-api-key": key }, body, "gemini");
  }
  const candidate = data?.candidates?.[0];
  if (!candidate?.content && data?.promptFeedback?.blockReason) throw new ProviderError("O Gemini bloqueou este pedido pelos filtros de segurança dele.", 400);
  const parts: any[] = candidate?.content?.parts ?? [];
  return {
    text: parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("").trim(),
    calls: parts.filter((p) => p.functionCall).map((p) => ({
      id: p.functionCall.id ?? randomUUID(), name: p.functionCall.name, args: p.functionCall.args ?? {},
      ...(p.functionCall.id ? { native: true } : {}),
      ...(p.thoughtSignature ? { sig: p.thoughtSignature } : {}),
    })),
    ...(parts.length ? { raw: parts } : {}),
    ...(used ? { model: used } : {}),
  };
}

export function ask(provider: Provider, key: string, model: string, system: string, messages: ChatMsg[], tools: ToolDef[]) {
  return provider === "claude" ? claude(key, model, system, messages, tools) : gemini(key, model, system, messages, tools);
}

/**
 * Confere a chave sem gastar e lista os modelos que ela pode usar para conversar.
 * null: chave recusada. Lista vazia: o provedor não informou, então o modelo não é conferido.
 */
export async function listModels(provider: Provider, key: string): Promise<string[] | null> {
  const res = await fetch(
    provider === "claude" ? "https://api.anthropic.com/v1/models?limit=1000" : "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    {
      cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: provider === "claude" ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : { "x-goog-api-key": key },
    },
  ).catch(() => null);
  if (!res) throw new ProviderError("Não foi possível falar com o provedor agora. Tente de novo.", 504);
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  if (provider === "claude") return (data?.data ?? []).map((m: any) => String(m?.id ?? "")).filter(Boolean);
  return (data?.models ?? [])
    .filter((m: any) => !Array.isArray(m?.supportedGenerationMethods) || m.supportedGenerationMethods.includes("generateContent"))
    .map((m: any) => String(m?.name ?? "").replace(/^models\//, "")).filter(Boolean);
}

/** Os nomes mais úteis para sugerir quando o modelo digitado não existe. */
export function suggestModels(provider: Provider, models: string[]) {
  const pref = provider === "claude" ? /sonnet|haiku/ : /flash/;
  // Versão mais nova primeiro: "gemini-3.8-flash" antes de "gemini-2.5-flash".
  const version = (m: string) => Number(/(\d+(?:\.\d+)?)/.exec(m)?.[1] ?? 0);
  models = [...models].sort((a, b) => version(b) - version(a));
  return [...models.filter((m) => pref.test(m) && !/image|tts|audio|live|embedding/.test(m)), ...models].filter((m, i, a) => a.indexOf(m) === i).slice(0, 5);
}
