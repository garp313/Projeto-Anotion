import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendToRecipients } from "@/lib/google/scheduled";
import type { ScheduledEmail } from "@/lib/scheduledEmail";

/** "Enviar agora": manda sem mexer na programação. O RLS só devolve o que a própria pessoa criou. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { id } = await req.json().catch(() => ({ id: null }));
  if (typeof id !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { data } = await supabase.from("scheduled_emails").select("*").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { sent, failed, reason } = await sendToRecipients(data as ScheduledEmail, new URL(req.url).origin);
  if (sent) await supabase.from("scheduled_emails").update({ last_sent_at: new Date().toISOString(), last_error: null }).eq("id", id);
  return NextResponse.json({ sent, failed: failed.length, reason });
}
