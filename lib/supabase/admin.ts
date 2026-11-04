import { createClient } from "@supabase/supabase-js";

/** Ignora o RLS. Só para o servidor agir sem usuário logado: cron, webhook e guarda de tokens. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
