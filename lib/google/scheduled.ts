import type { SupabaseClient } from "@supabase/supabase-js";
import { accessTokenFor } from "./tokens";
import { sendGmail } from "./gmail";
import { addDays, isDue, nextSendOn, type ScheduledEmail } from "@/lib/scheduledEmail";

/** Envia para cada pessoa. Sem token, usa a sessão de quem está logado. */
export async function sendToRecipients(row: Pick<ScheduledEmail, "page_id" | "recipients" | "subject" | "message">, origin: string, token?: string) {
  const failed: string[] = [];
  let sent = 0;
  let reason: string | undefined;
  for (const email of row.recipients) {
    const link = `${origin}/workspace/${row.page_id}?para=${encodeURIComponent(email)}`;
    const result = await sendGmail(email, row.subject, `${row.message}\n\nAbrir a página: ${link}`, { token });
    if (result === "sent") sent++;
    else { failed.push(email); if (result === "not_connected") reason = result; }
  }
  return { sent, failed, reason };
}

/** Roda no cron. Reserva o envio antes de mandar: o cron pode rodar duas vezes e ninguém recebe em dobro. */
export async function sendDueEmails(admin: SupabaseClient, origin: string, today: string, now = new Date()) {
  const report = { sent: 0, failed: 0 };
  const { data } = await admin.from("scheduled_emails").select("*").eq("active", true).lte("send_on", today);
  // Só o que já chegou no horário escolhido.
  for (const row of ((data ?? []) as ScheduledEmail[]).filter((r) => isDue(r, now))) {
    try {
      const { data: page } = await admin.from("pages").select("is_archived").eq("id", row.page_id).maybeSingle();
      if (!page || page.is_archived) continue;
      const token = await accessTokenFor(row.created_by);
      if (!token) {
        await admin.from("scheduled_emails").update({ last_error: "not_connected" }).eq("id", row.id);
        report.failed++;
        continue;
      }
      const next = nextSendOn(row.first_send_on, row.repeat, today, row.repeat_days ?? []);
      const { data: claimed } = await admin.from("scheduled_emails")
        .update({ send_on: next ?? row.send_on, active: next !== null })
        .eq("id", row.id).eq("active", true).eq("send_on", row.send_on).select("id");
      if (!claimed?.length) continue;

      const { sent, failed, reason } = await sendToRecipients(row, origin, token);
      report.sent += sent;
      report.failed += failed.length;
      await admin.from("scheduled_emails").update(sent
        ? { last_sent_at: new Date().toISOString(), last_error: failed.length ? `Não enviado para: ${failed.join(", ")}` : null }
        // Ninguém recebeu: tenta de novo amanhã no mesmo horário, sem insistir a cada poucos minutos.
        : { send_on: addDays(today, 1), active: true, last_error: reason ?? "failed" }).eq("id", row.id);
    } catch (e) {
      console.error(e);
      report.failed++;
    }
  }
  return report;
}
