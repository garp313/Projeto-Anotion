import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isProvider, loadKey, updateModel } from "@/lib/ai/keys";
import { ask, ProviderError } from "@/lib/ai/providers";
import { runTool, summarize, systemPrompt } from "@/lib/ai/run";
import { TOOLS } from "@/lib/ai/tools";
import { PROVIDER_LABEL, WRITE_TOOLS, pendingCalls, type ChatMsg, type ChatResponse, type ToolCall, type ToolResult } from "@/lib/ai/types";

export const maxDuration = 60;

const MAX_ROUNDS = 8;
const WINDOW = 40;
const NAMES = new Set(TOOLS.map((t) => t.name));
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const isObj = (v: unknown): v is Record<string, any> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** A conversa vem do navegador: só passa o que tem o formato esperado. */
function clean(raw: unknown): ChatMsg[] | null {
  if (!Array.isArray(raw) || raw.length > 300 || JSON.stringify(raw).length > 800_000) return null;
  const out: ChatMsg[] = [];
  for (const m of raw) {
    if (!isObj(m)) return null;
    if (m.role === "user") out.push({ role: "user", text: str(m.text, 20_000) });
    else if (m.role === "assistant") {
      const calls: ToolCall[] = (Array.isArray(m.calls) ? m.calls : []).filter((c: any) => isObj(c) && NAMES.has(c.name) && typeof c.id === "string")
        .map((c: any) => ({ id: str(c.id, 200), name: c.name, args: isObj(c.args) ? c.args : {}, ...(typeof c.sig === "string" ? { sig: c.sig } : {}), ...(c.native === true ? { native: true } : {}) }));
      const raw = Array.isArray(m.raw) && JSON.stringify(m.raw).length < 200_000 ? m.raw : undefined;
      out.push({ role: "assistant", text: str(m.text, 50_000), ...(calls.length ? { calls } : {}), ...(raw ? { raw } : {}) });
    } else if (m.role === "tool") {
      const results: ToolResult[] = (Array.isArray(m.results) ? m.results : []).filter(isObj)
        .map((r: any) => ({ id: str(r.id, 200), name: str(r.name, 64), output: str(r.output, 20_000) }));
      out.push({ role: "tool", results });
    } else return null;
  }
  return out;
}

/** Só as últimas mensagens vão para a IA, começando sempre numa fala da pessoa. */
function windowOf(messages: ChatMsg[]) {
  let start = Math.max(0, messages.length - WINDOW);
  while (start > 0 && messages[start].role !== "user") start--;
  return messages.slice(start);
}

export async function POST(req: Request) {
  const started = Date.now();
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const messages = clean(body.messages);
  const { provider, decision } = body;
  const pageId = typeof body.pageId === "string" ? body.pageId : null;
  if (!isProvider(provider) || !messages?.length) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  const key = await loadKey(sb, provider);
  if (!key) return NextResponse.json({ error: `Conecte a sua chave do ${PROVIDER_LABEL[provider]} nas configurações do assistente.` }, { status: 400 });

  const until = started + 55_000;
  let changed = false;
  let switched: string | undefined;
  const dated: string[] = [];
  const respond = (pending: string[] | null, error?: string) =>
    NextResponse.json({ messages, pending, changed, dated, ...(switched ? { model: switched } : {}), ...(error ? { error } : {}) } satisfies ChatResponse);

  const run = async (calls: ToolCall[], skipWrites = false) => {
    const results: ToolResult[] = [];
    for (const call of calls) {
      if (skipWrites && WRITE_TOOLS.has(call.name)) { results.push({ id: call.id, name: call.name, output: JSON.stringify({ erro: "A pessoa não aplicou esta alteração." }) }); continue; }
      const r = await runTool(sb, call);
      changed ||= r.changed;
      dated.push(...r.dated);
      results.push({ id: call.id, name: call.name, output: r.output });
    }
    messages.push({ role: "tool", results });
  };

  // Resposta a uma alteração proposta: aplica ou registra a recusa.
  const waiting = pendingCalls(messages);
  if (waiting.length) {
    if (decision !== "apply" && decision !== "discard") return NextResponse.json({ error: "Responda à alteração proposta antes de continuar." }, { status: 409 });
    await run(waiting, decision === "discard");
    if (decision === "discard") return respond(null);
  } else if (messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  try {
    const system = await systemPrompt(sb, user, pageId);
    for (let round = 0; round < MAX_ROUNDS; round++) {
      // Perto do limite da Vercel: para aqui e guarda o que já foi feito.
      if (round > 0 && until - Date.now() < 12_000) break;
      const reply = await ask(provider, key.apiKey, key.model, system, windowOf(messages), TOOLS, until);
      if (reply.model && reply.model !== key.model) {
        // Modelo desativado: guarda o substituto para as próximas conversas.
        key.model = switched = reply.model;
        await updateModel(sb, provider, reply.model);
      }
      messages.push({ role: "assistant", text: reply.text, ...(reply.calls.length ? { calls: reply.calls } : {}), ...(reply.raw ? { raw: reply.raw } : {}) });
      if (!reply.calls.length) return respond(null);
      if (reply.calls.some((c) => WRITE_TOOLS.has(c.name))) {
        return respond(await Promise.all(reply.calls.filter((c) => WRITE_TOOLS.has(c.name)).map((c) => summarize(sb, c))));
      }
      await run(reply.calls);
    }
    messages.push({ role: "assistant", text: "Parei aqui para não demorar demais. Diga \"continue\" se quiser que eu siga." });
    return respond(null);
  } catch (e) {
    if (!(e instanceof ProviderError)) console.error("ai chat", e);
    return respond(null, e instanceof ProviderError ? e.message : "Algo deu errado ao falar com a IA. Tente de novo.");
  }
}
