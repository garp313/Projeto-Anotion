import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { accessToken } from "@/lib/google/calendar";
import { GmailScopeError, getMessage, sendGmail } from "@/lib/google/gmail";

const address = (from: string) => /<([^>]+)>/.exec(from)?.[1] ?? from.trim();

/** Responde ou encaminha o e-mail ligado à tarefa e registra o envio nos comentários. */
export async function POST(req: Request) {
  const { pageId, text, forwardTo } = await req.json().catch(() => ({}));
  if (typeof pageId !== "string" || typeof text !== "string" || !text.trim()) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const supabase = await createClient();
  // Só quem enxerga a tarefa chega aqui: o RLS devolve vazio para os demais.
  const { data: page } = await supabase.from("pages").select("id").eq("id", pageId).maybeSingle();
  const admin = createAdminClient();
  if (!page || !admin) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data: link } = await admin.from("external_links").select("external_id,owner_id")
    .eq("page_id", pageId).eq("provider", "gmail").eq("kind", "message").maybeSingle();
  if (!link) return NextResponse.json({ error: "no_email" }, { status: 404 });

  const token = await accessToken();
  if (!token) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  try {
    const m = await getMessage(token, link.external_id);
    const forward = typeof forwardTo === "string" && forwardTo.trim();
    const to = forward ? forwardTo.trim() : address(m.replyTo || m.from);
    const subject = `${forward ? "Enc" : "Re"}: ${m.subject.replace(/^(re|enc|fwd?):\s*/i, "")}`;
    const body = forward ? `${text}\n\n---------- Mensagem encaminhada ----------\nDe: ${m.from}\nAssunto: ${m.subject}\n\n${m.body}` : text;
    const result = await sendGmail(to, subject, body, {
      token, threadId: forward ? undefined : m.threadId,
      headers: !forward && m.messageId ? { "In-Reply-To": m.messageId, References: m.messageId } : undefined,
    });
    if (result !== "sent") return NextResponse.json({ error: result }, { status: 502 });
    await supabase.from("comments").insert({ page_id: pageId, body: `${forward ? "Encaminhado" : "Respondido"} por e-mail para ${to}:\n${text}` });
    return NextResponse.json({ result });
  } catch (e) {
    if (e instanceof GmailScopeError) return NextResponse.json({ error: "needs_scope" }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }
}
