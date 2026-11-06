export type Repeat = "none" | "weekly" | "monthly";

export const REPEAT_LABEL: Record<Repeat, string> = { none: "Não repetir", weekly: "Toda semana", monthly: "Todo mês" };

export type ScheduledEmail = {
  id: string; page_id: string; created_by: string; recipients: string[]; subject: string; message: string;
  first_send_on: string; send_on: string; repeat: Repeat; active: boolean; last_sent_at: string | null; last_error: string | null;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** O cron roda às 8h de Brasília: é a data de lá que decide o que vence hoje. */
export const todayInBrazil = (now = new Date()) => iso(new Date(now.getTime() - 3 * 3_600_000));

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

function addMonths(date: string, months: number) {
  const start = new Date(`${date}T00:00:00Z`);
  const year = start.getUTCFullYear(), month = start.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay))));
}

/** Próximo envio depois de hoje, ou null se não repete. Dias perdidos não viram envios acumulados. */
export function nextSendOn(first: string, repeat: Repeat, today: string): string | null {
  if (repeat === "none") return null;
  for (let n = 1; ; n++) {
    const next = repeat === "weekly" ? addDays(first, 7 * n) : addMonths(first, n);
    if (next > today) return next;
  }
}
