// Chave de IA de cada pessoa, cifrada com TOKEN_ENC_KEY. Só o servidor decifra.
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt, key as encKey } from "@/lib/google/tokens";
import { DEFAULT_MODEL, type KeyStatus, type Provider } from "./types";

export const PROVIDERS: Provider[] = ["claude", "gemini"];
export const isProvider = (v: unknown): v is Provider => v === "claude" || v === "gemini";
export const serverReady = () => Boolean(encKey());

/** Sem a migration 0017 a tabela não existe. */
export const missingTable = (e?: { code?: string } | null) => ["PGRST205", "42P01"].includes(e?.code ?? "");

export async function keyStatus(sb: SupabaseClient) {
  const { data, error } = await sb.from("ai_keys").select("provider,key_hint,model");
  const keys = { claude: null, gemini: null } as Record<Provider, KeyStatus>;
  for (const r of data ?? []) if (isProvider(r.provider)) keys[r.provider] = { hint: r.key_hint, model: r.model || DEFAULT_MODEL[r.provider] };
  return { keys, migrated: !missingTable(error), error };
}

export async function saveKey(sb: SupabaseClient, userId: string, provider: Provider, apiKey: string, model: string) {
  const k = encKey();
  if (!k) throw new Error("TOKEN_ENC_KEY ausente");
  return sb.from("ai_keys").upsert({
    user_id: userId, provider, key_enc: encrypt(apiKey, k), key_hint: apiKey.slice(-4), model, updated_at: new Date().toISOString(),
  });
}

export async function updateModel(sb: SupabaseClient, provider: Provider, model: string) {
  return sb.from("ai_keys").update({ model, updated_at: new Date().toISOString() }).eq("provider", provider);
}

export async function loadKey(sb: SupabaseClient, provider: Provider): Promise<{ apiKey: string; model: string } | null> {
  const k = encKey();
  if (!k) return null;
  const { data } = await sb.from("ai_keys").select("key_enc,model").eq("provider", provider).maybeSingle();
  if (!data) return null;
  try {
    return { apiKey: decrypt(data.key_enc, k), model: data.model || DEFAULT_MODEL[provider] };
  } catch {
    return null; // TOKEN_ENC_KEY trocou: a pessoa cola a chave de novo.
  }
}
