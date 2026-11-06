import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { accessTokenFor } from "@/lib/google/tokens";
import { listMessages } from "@/lib/google/gmail";
import { createTaskFromMessage, defaultTaskDatabase } from "@/lib/google/emailTask";
import { ensureChannel, sameSecret } from "@/lib/google/sync";
import { sendDueEmails } from "@/lib/google/scheduled";
import { todayInBrazil } from "@/lib/scheduledEmail";

const LABEL_QUERY = 'label:"→Tarefa" newer_than:30d';
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const sent = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || !sameSecret(secret, sent)) return new NextResponse(null, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const origin = new URL(req.url).origin;
  const { data: accounts } = await admin.from("google_accounts").select("user_id").eq("status", "ok");
  const scheduled = await sendDueEmails(admin, origin, todayInBrazil()).catch((e) => { console.error(e); return { sent: 0, failed: 1 }; });
  const report = { labeled: 0, channels: 0, failed: 0, scheduled };

  for (const account of accounts ?? []) {
    try {
      const token = await accessTokenFor(account.user_id);
      if (!token) continue;
      if (await ensureChannel(token, account.user_id, origin)) report.channels++;

      const database = await defaultTaskDatabase(admin);
      if (database) {
        const labeled = await listMessages(token, LABEL_QUERY).catch(() => []);
        for (const m of labeled) {
          if ((await createTaskFromMessage(admin, token, account.user_id, m.id, database)).created) report.labeled++;
        }
      }
    } catch (e) {
      // Uma conta com problema não pode impedir as outras.
      console.error(e);
      report.failed++;
    }
  }
  return NextResponse.json(report);
}
