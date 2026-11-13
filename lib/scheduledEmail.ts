export type Repeat = "none" | "weekly" | "monthly";

export const REPEAT_LABEL: Record<Repeat, string> = { none: "Não repetir", weekly: "Toda semana", monthly: "Todo mês" };

export type ScheduledEmail = {
  id: string; page_id: string; created_by: string; recipients: string[]; subject: string; message: string;
  first_send_on: string; send_on: string; send_at?: string; repeat: Repeat; repeat_days?: number[]; active: boolean; last_sent_at: string | null; last_error: string | null;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Os horários são de Brasília (UTC-3, sem horário de verão): é a data de lá que decide o que vence hoje. */
export const todayInBrazil = (now = new Date()) => iso(new Date(now.getTime() - 3 * 3_600_000));

/** Hora de Brasília em "hh:mm". */
export const timeInBrazil = (now = new Date()) => new Date(now.getTime() - 3 * 3_600_000).toISOString().slice(11, 16);

/** Horário padrão de quem programou antes de existir o campo. */
export const DEFAULT_SEND_AT = "08:00";
export const sendAtOf = (row: { send_at?: string | null }) => (row.send_at ?? DEFAULT_SEND_AT).slice(0, 5);

/** Já passou da data e do horário escolhidos? Atrasados (cron parado) também saem. */
export function isDue(row: { send_on: string; send_at?: string | null }, now = new Date()) {
  const today = todayInBrazil(now);
  return row.send_on < today || (row.send_on === today && sendAtOf(row) <= timeInBrazil(now));
}

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

function matchesDay(date: string, repeat: Repeat, days: number[]) {
  const d = new Date(`${date}T00:00:00Z`);
  if (repeat === "weekly") return days.includes(d.getUTCDay());
  const day = d.getUTCDate();
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  // Dia 31 num mês de 30 dias sai no último dia, em vez de pular o mês.
  return days.includes(day) || (day === last && days.some((x) => x > last));
}

/** Primeira data a partir de `start` que cai num dos dias escolhidos. */
export function firstSendOn(start: string, repeat: Repeat, days: number[]) {
  if (repeat === "none" || !days.length) return start;
  for (let n = 0; n < 62; n++) {
    const date = addDays(start, n);
    if (matchesDay(date, repeat, days)) return date;
  }
  return start;
}

/** Próximo envio depois de hoje, ou null se não repete. Dias perdidos não viram envios acumulados. */
export function nextSendOn(first: string, repeat: Repeat, today: string, days: number[] = []): string | null {
  if (repeat === "none") return null;
  if (days.length) return firstSendOn(addDays(today > first ? today : first, 1), repeat, days);
  for (let n = 1; ; n++) {
    const next = repeat === "weekly" ? addDays(first, 7 * n) : addMonths(first, n);
    if (next > today) return next;
  }
}
