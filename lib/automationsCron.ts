// Regras "quando o prazo vencer": rodam no cron diário, sem ninguém logado.
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SCHEMA, type ColumnSchema } from "@/components/database/types";
import { automationsOf, isDone, planOverdue } from "@/lib/automations";
import { accessTokenFor } from "@/lib/google/tokens";
import { sendGmail } from "@/lib/google/gmail";

type Report = { rows: number; notices: number; emails: number };

/** `admin` ignora o RLS: só o cron chama, depois de conferir o CRON_SECRET. */
export async function runOverdueAutomations(admin: SupabaseClient, origin: string, today: string): Promise<Report> {
  const report: Report = { rows: 0, notices: 0, emails: 0 };
  const { data: dbs } = await admin.from("pages").select("id,database_schema,row_properties").eq("is_database", true).eq("is_archived", false);
  const tokens = new Map<string, string | null>();
  const tokenOf = async (userId: string) => {
    if (!tokens.has(userId)) tokens.set(userId, await accessTokenFor(userId).catch(() => null));
    return tokens.get(userId) ?? null;
  };

  for (const db of dbs ?? []) {
    const rules = automationsOf(db).filter((r) => r.enabled && r.when.type === "overdue");
    if (!rules.length) continue;
    const schema: ColumnSchema[] = db.database_schema?.length ? db.database_schema : DEFAULT_SCHEMA;
    const { data: rows } = await admin.from("pages").select("id,title,row_properties,created_by").eq("parent_id", db.id).eq("is_archived", false);

    for (const row of rows ?? []) {
      const plan = planOverdue(rules, row, today, isDone(schema, row.row_properties));
      if (!plan.fired.length) continue;
      report.rows++;
      // Marca o prazo já avisado: amanhã a mesma linha não avisa de novo.
      for (const [key, value] of Object.entries({ ...plan.props, __overdue: plan.mark })) {
        await admin.rpc("set_row_prop", { p_page: row.id, p_key: key, p_value: value });
      }
      for (const n of plan.notices) {
        const author = rules.find((r) => r.id === n.rule)?.author ?? null;
        const { data: people } = await admin.from("profiles").select("id,email").in("id", n.targets);
        for (const person of people ?? []) {
          if (n.email && author && person.email) {
            const token = await tokenOf(author);
            if (token && await sendGmail(person.email, n.message, `${n.message}\n\nAbrir: ${origin}/workspace/${row.id}`, { token }) === "sent") {
              report.emails++;
            }
          }
          const { error } = await admin.from("notifications").insert({
            user_id: person.id, actor_id: author, kind: "status", page_id: row.id, body: n.message,
            // Sem Gmail de quem criou a regra, o aviso fica só no Inbox.
            emailed_at: new Date().toISOString(),
          });
          if (!error) report.notices++;
        }
      }
    }
  }
  return report;
}
