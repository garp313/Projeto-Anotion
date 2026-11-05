import type { SupabaseClient } from "@supabase/supabase-js";

const MISSING = ["PGRST202", "42883"];

/**
 * Grava uma propriedade sem tocar nas outras. `whole` é o caminho antigo, usado só
 * enquanto a migration 0009 não tiver rodado.
 */
export async function setRowProp(client: SupabaseClient, pageId: string, key: string, value: unknown, whole?: Record<string, any>) {
  const { error } = await client.rpc("set_row_prop", { p_page: pageId, p_key: key, p_value: value ?? null });
  if (!error) return;
  if (MISSING.includes(error.code) && whole) {
    const fallback = await client.from("pages").update({ row_properties: whole }).eq("id", pageId);
    if (fallback.error) throw fallback.error;
    return;
  }
  throw error;
}
