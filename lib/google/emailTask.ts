import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMessage, type FullMessage } from "./gmail";

const MAX_LINES = 200;
const text = (t: string) => ({ type: "text", text: t, styles: {} });
const paragraph = (content: any[]) => ({ type: "paragraph", content });

/** Corpo em texto puro, um parágrafo por linha: nada do HTML do e-mail chega à página. */
export function emailBlocks(m: FullMessage) {
  const lines = m.body.split(/\r?\n/).map((l) => l.trimEnd());
  const body = lines.slice(0, MAX_LINES).filter((l, i, all) => l || all[i - 1]);
  return [
    paragraph([text(`De: ${m.from}`)]),
    paragraph([{ type: "link", href: `https://mail.google.com/mail/u/0/#all/${m.id}`, content: [text("Abrir no Gmail")] }]),
    ...body.map((l) => paragraph(l ? [text(l)] : [])),
    ...(lines.length > MAX_LINES ? [paragraph([text("… e-mail cortado. O restante está no Gmail.")])] : []),
  ];
}

export type EmailTaskResult = { pageId: string; created: boolean };

/**
 * `client` grava a página: com a sessão da pessoa na tela, assim o RLS confere se ela pode
 * editar o banco. O vínculo é o que impede duplicar, mesmo com dois cliques ao mesmo tempo.
 */
export async function createTaskFromMessage(
  client: SupabaseClient, token: string, ownerId: string, messageId: string, databaseId: string
): Promise<EmailTaskResult> {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente");
  const existing = () => admin.from("external_links").select("page_id")
    .eq("provider", "gmail").eq("kind", "message").eq("external_id", messageId).maybeSingle();

  const found = (await existing()).data;
  if (found) return { pageId: found.page_id, created: false };

  const { data: db, error: dbError } = await client.from("pages").select("workspace_id").eq("id", databaseId).eq("is_database", true).single();
  if (dbError) throw dbError;
  const message = await getMessage(token, messageId);

  const id = randomUUID();
  const { error } = await client.from("pages").insert({
    id, workspace_id: db.workspace_id, parent_id: databaseId, title: message.subject || "E-mail sem assunto",
    position: Date.now(), row_properties: {}, content_json: emailBlocks(message),
  });
  if (error) throw error;

  const link = await admin.from("external_links").insert({ page_id: id, provider: "gmail", kind: "message", external_id: messageId, owner_id: ownerId });
  if (link.error) {
    // Outro pedido chegou antes: desfaz esta cópia e aponta para a tarefa que ficou.
    await admin.from("pages").delete().eq("id", id);
    const winner = (await existing()).data;
    if (winner) return { pageId: winner.page_id, created: false };
    throw link.error;
  }
  return { pageId: id, created: true };
}

/** Banco de destino do rótulo "→Tarefa": o de nome Tarefas no workspace da pessoa. */
export async function defaultTaskDatabase(client: SupabaseClient, ownerId: string) {
  const { data: ws } = await client.from("workspaces").select("id").eq("owner_id", ownerId).limit(1).maybeSingle();
  if (!ws) return null;
  const { data } = await client.from("pages").select("id").eq("workspace_id", ws.id).eq("is_database", true)
    .eq("is_archived", false).eq("title", "Tarefas").limit(1).maybeSingle();
  return data?.id ?? null;
}
