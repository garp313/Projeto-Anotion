import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isProvider, keyStatus, loadKey, saveKey, serverReady, updateModel } from "@/lib/ai/keys";
import { listModels, ProviderError, suggestModels } from "@/lib/ai/providers";
import { DEFAULT_MODEL, type KeysResponse } from "@/lib/ai/types";

const MODEL = /^[a-zA-Z0-9._:-]{1,80}$/;

async function session() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return { sb, user };
}

/** Quais IAs a pessoa conectou. A chave nunca volta ao navegador, só os 4 últimos caracteres. */
export async function GET() {
  const { sb, user } = await session();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { keys, migrated } = await keyStatus(sb);
  return NextResponse.json({ ready: serverReady(), migrated, keys } satisfies KeysResponse);
}

export async function POST(req: Request) {
  const { sb, user } = await session();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { provider } = body;
  const apiKey = typeof body.key === "string" ? body.key.trim() : "";
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : isProvider(provider) ? DEFAULT_MODEL[provider] : "";
  if (!isProvider(provider) || !MODEL.test(model) || apiKey.length > 300) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  if (!serverReady()) return NextResponse.json({ error: "O servidor está sem TOKEN_ENC_KEY para guardar a chave com segurança." }, { status: 503 });

  if (apiKey && (/\s/.test(apiKey) || apiKey.length < 20)) return NextResponse.json({ error: "Essa chave não parece completa." }, { status: 400 });
  // Só o modelo mudou: confere com a chave já guardada.
  const checkWith = apiKey || (await loadKey(sb, provider))?.apiKey;
  if (!checkWith) return NextResponse.json({ error: "Cole a chave da API." }, { status: 400 });
  try {
    const models = await listModels(provider, checkWith);
    if (!models) return NextResponse.json({ error: apiKey ? "A chave foi recusada. Confira se copiou inteira." : "A chave guardada foi recusada. Cole a chave de novo." }, { status: 400 });
    if (models.length && !models.includes(model)) {
      return NextResponse.json({ error: `O modelo "${model}" não existe para esta chave. Experimente: ${suggestModels(provider, models).join(", ")}.` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof ProviderError ? e.message : "Falha ao conferir a chave." }, { status: 502 });
  }
  if (!apiKey) {
    const { error } = await updateModel(sb, provider, model);
    return error ? NextResponse.json({ error: "Não foi possível salvar." }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  const { error } = await saveKey(sb, user.id, provider, apiKey, model);
  if (error) {
    const migrate = ["PGRST205", "42P01"].includes(error.code ?? "");
    return NextResponse.json({ error: migrate ? "Falta rodar a migration 0017 no Supabase." : "Não foi possível salvar a chave." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { sb, user } = await session();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const provider = new URL(req.url).searchParams.get("provider");
  if (!isProvider(provider)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { error } = await sb.from("ai_keys").delete().eq("provider", provider);
  return error ? NextResponse.json({ error: "Não foi possível remover." }, { status: 500 }) : NextResponse.json({ ok: true });
}
