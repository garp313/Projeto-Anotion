import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

function key() {
  const raw = process.env.TOKEN_ENC_KEY;
  const k = raw ? Buffer.from(raw, "base64") : null;
  return k?.length === 32 ? k : null;
}

export function encrypt(text: string, k: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decrypt(packed: string, k: Buffer) {
  const [iv, tag, data] = packed.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", k, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Sem as chaves de produção (no localhost) a conexão segue só nos cookies. */
export async function saveRefreshToken(userId: string, refreshToken: string) {
  const admin = createAdminClient();
  const k = key();
  if (!admin || !k) return false;
  const { error } = await admin.from("google_accounts").upsert({
    user_id: userId, refresh_token_enc: encrypt(refreshToken, k), status: "ok", updated_at: new Date().toISOString(),
  });
  if (error) console.error("google_accounts", error.message);
  return !error;
}

/** Access token de uma pessoa sem depender do navegador dela: cron, webhook e disponibilidade. */
export async function accessTokenFor(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const k = key();
  const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = process.env;
  if (!admin || !k || !id || !secret) return null;
  const { data } = await admin.from("google_accounts").select("refresh_token_enc,status").eq("user_id", userId).maybeSingle();
  if (!data || data.status !== "ok") return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: decrypt(data.refresh_token_enc, k), grant_type: "refresh_token" }),
  });
  if (res.ok) return (await res.json()).access_token;
  // Acesso expirado ou revogado: o app pede para reconectar em vez de falhar em silêncio.
  if ((await res.json().catch(() => ({}))).error === "invalid_grant") {
    await admin.from("google_accounts").update({ status: "reconnect" }).eq("user_id", userId);
  }
  return null;
}
