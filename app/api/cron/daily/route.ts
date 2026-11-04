import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { accessTokenFor } from "@/lib/google/tokens";
import { sendGmail, listMessages } from "@/lib/google/gmail";
import { createTaskFromMessage, defaultTaskDatabase } from "@/lib/google/emailTask";
import { ensureChannel, sameSecret, APP_TZ } from "@/lib/google/sync";
import { loadTasks, type Task } from "@/lib/tasks";

const LABEL_QUERY = 'label:"→Tarefa" newer_than:30d';
const dayIn = (offset: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: APP_TZ }).format(new Date(Date.now() + offset * 86_400_000));

/** Texto do resumo, ou null quando não há nada para avisar. */
function digestText(tasks: Task[], origin: string) {
  const today = dayIn(0), tomorrow = dayIn(1);
  const dueOf = (t: Task) => (t.due?.end ?? t.due?.start ?? "").slice(0, 10);
  const line = (t: Task) => `- ${t.title || "Sem título"}: ${origin}/workspace/${t.id}`;
  const part = (label: string, list: Task[]) => (list.length ? [`${label} (${list.length})`, ...list.map(line), ""] : []);
  const late = tasks.filter((t) => dueOf(t) && dueOf(t) < today);
  const now = tasks.filter((t) => dueOf(t) === today);
  const next = tasks.filter((t) => dueOf(t) === tomorrow);
  const lines = [...part("Atrasadas", late), ...part("Hoje", now), ...part("Amanhã", next)];
  return lines.length ? lines.join("\n") : null;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const sent = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || !sameSecret(secret, sent)) return new NextResponse(null, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const origin = new URL(req.url).origin;
  const { data: accounts } = await admin.from("google_accounts").select("user_id,daily_digest").eq("status", "ok");
  const { tasks } = await loadTasks(admin as any);
  const report = { digests: 0, labeled: 0, channels: 0, failed: 0 };

  for (const account of accounts ?? []) {
    try {
      const token = await accessTokenFor(account.user_id);
      if (!token) continue;
      const { data: me } = await admin.from("profiles").select("email,name").eq("id", account.user_id).single();

      if (await ensureChannel(token, account.user_id, origin)) report.channels++;

      const database = await defaultTaskDatabase(admin, account.user_id);
      if (database) {
        const labeled = await listMessages(token, LABEL_QUERY).catch(() => []);
        for (const m of labeled) {
          if ((await createTaskFromMessage(admin, token, account.user_id, m.id, database)).created) report.labeled++;
        }
      }

      if (account.daily_digest && me) {
        const mine = tasks.filter((t) => !t.done && t.people.some((p) => p.id === account.user_id || p.name === me.name || p.name === me.email));
        const body = digestText(mine, origin);
        if (body && (await sendGmail(me.email, "Suas tarefas de hoje", body, { token })) === "sent") report.digests++;
      }
    } catch (e) {
      // Uma conta com problema não pode impedir o resumo das outras.
      console.error(e);
      report.failed++;
    }
  }
  return NextResponse.json(report);
}
