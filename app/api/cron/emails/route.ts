import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sameSecret } from "@/lib/google/sync";
import { sendDueEmails } from "@/lib/google/scheduled";
import { todayInBrazil } from "@/lib/scheduledEmail";

/** Só os e-mails programados. Chamado a cada 5 minutos pelo Supabase (migration 0016), para respeitar o horário escolhido. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const sent = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || !sameSecret(secret, sent)) return new NextResponse(null, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const now = new Date();
  const report = await sendDueEmails(admin, new URL(req.url).origin, todayInBrazil(now), now);
  return NextResponse.json(report);
}
