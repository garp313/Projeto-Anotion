import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendToRecipients } from "@/lib/google/scheduled";
import type { ScheduledEmail } from "@/lib/scheduledEmail";

const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** "Enviar agora": de um programado, sem mexer na programação, ou direto do formulário. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const origin = new URL(req.url).origin;
  const input = await req.json().catch(() => ({}));

  if (typeof input.id === "string") {
    // O RLS só devolve o que a própria pessoa criou.
    const { data } = await supabase.from("scheduled_emails").select("*").eq("id", input.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const { sent, failed, reason } = await sendToRecipients(data as ScheduledEmail, origin);
    if (sent) await supabase.from("scheduled_emails").update({ last_sent_at: new Date().toISOString(), last_error: null }).eq("id", input.id);
    return NextResponse.json({ sent, failed: failed.length, reason });
  }

  const { pageId, recipients, subject, message } = input;
  const valid = typeof pageId === "string" && Array.isArray(recipients) && recipients.length >= 1 && recipients.length <= 20
    && recipients.every((r) => typeof r === "string") && text(subject, 200) && text(message, 5000);
  if (!valid) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  // Só para o time e de uma página visível: a rota não vira um disparador de e-mails.
  const [{ data: page }, { data: people }] = await Promise.all([
    supabase.from("pages").select("id").eq("id", pageId).maybeSingle(),
    supabase.rpc("collaborators"),
  ]);
  if (!page) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const team = new Set(((people ?? []) as { email: string }[]).map((p) => p.email.toLowerCase()));
  if (!recipients.every((r: string) => team.has(r.toLowerCase()))) return NextResponse.json({ error: "not_member" }, { status: 403 });
  const { sent, failed, reason } = await sendToRecipients({ page_id: pageId, recipients, subject, message }, origin);
  return NextResponse.json({ sent, failed: failed.length, reason });
}
