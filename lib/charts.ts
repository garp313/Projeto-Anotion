// Números do dashboard a partir das linhas do banco. Puro: a tela só desenha.
import type { ColumnSchema } from "@/components/database/types";
import { dueColumn, dueOf, isDone } from "@/lib/automations";

export type ChartKind = "group" | "overdue_weeks" | "created_weeks";
export type ChartConfig = { id: string; kind: ChartKind; col?: string };

type Row = { id: string; row_properties: Record<string, any>; created_at?: string | null };

export type Kpis = { total: number; open: number; done: number; overdue: number; pct: number };
/** Uma barra: quantas abertas e quantas concluídas têm este valor. */
export type Bar = { label: string; open: number; done: number };
export type Week = { label: string; value: number };

export const GROUPABLE = ["status", "select", "multi_select", "person", "checkbox"];
const MAX_BARS = 8;
const EMPTY = "Sem valor";

export function isOverdue(schema: ColumnSchema[], row: Row, today: string) {
  const due = dueColumn(schema);
  const day = due ? dueOf(row.row_properties?.[due.id]) : null;
  return Boolean(day && day < today && !isDone(schema, row.row_properties));
}

export function kpis(rows: Row[], schema: ColumnSchema[], today: string): Kpis {
  let done = 0, overdue = 0;
  for (const r of rows) {
    if (isDone(schema, r.row_properties)) done++;
    else if (isOverdue(schema, r, today)) overdue++;
  }
  return { total: rows.length, open: rows.length - done, done, overdue, pct: rows.length ? Math.round((done / rows.length) * 100) : 0 };
}

/** Rótulos da linha numa coluna: uma linha com duas pessoas conta para as duas. */
function labelsOf(col: ColumnSchema, v: any): string[] {
  const opt = (id: unknown) => col.options?.find((o) => o.id === id)?.value;
  let out: string[] = [];
  if (col.type === "status" || col.type === "select") out = [opt(v)].filter(Boolean) as string[];
  else if (col.type === "multi_select") out = (Array.isArray(v) ? v : []).map(opt).filter(Boolean) as string[];
  else if (col.type === "person") out = (Array.isArray(v) ? v : []).map((p: any) => String(p?.name ?? "").trim()).filter(Boolean);
  else if (col.type === "checkbox") out = [v ? "Sim" : "Não"];
  return out.length ? [...new Set(out)] : [EMPTY];
}

/** Barras por valor de uma coluna. Status e seleção seguem a ordem das opções; o resto, do maior para o menor. */
export function groupBars(rows: Row[], schema: ColumnSchema[], colId: string): Bar[] {
  const col = schema.find((c) => c.id === colId);
  if (!col) return [];
  const map = new Map<string, Bar>();
  for (const r of rows) {
    const done = isDone(schema, r.row_properties);
    for (const label of labelsOf(col, r.row_properties?.[col.id])) {
      const b = map.get(label) ?? { label, open: 0, done: 0 };
      if (done) b.done++; else b.open++;
      map.set(label, b);
    }
  }
  const ordered = col.type === "status" || col.type === "select"
    ? [...(col.options ?? []).map((o) => map.get(o.value)).filter((b): b is Bar => Boolean(b)), ...(map.has(EMPTY) ? [map.get(EMPTY)!] : [])]
    : [...map.values()].sort((a, b) => b.open + b.done - (a.open + a.done) || Number(a.label === EMPTY) - Number(b.label === EMPTY));
  if (ordered.length <= MAX_BARS) return ordered;
  // Muitas categorias: as menores viram "Outros", em vez de cores e barras demais.
  const rest = ordered.slice(MAX_BARS - 1).reduce((acc, b) => ({ ...acc, open: acc.open + b.open, done: acc.done + b.done }), { label: "Outros", open: 0, done: 0 });
  return [...ordered.slice(0, MAX_BARS - 1), rest];
}

const DAY = 86_400_000;
const parse = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
/** Segunda-feira da semana do dia. */
export const monday = (d: string) => { const t = parse(d); return iso(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY); };
const short = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * Contagem por semana (segunda a domingo) nas últimas `weeks` semanas.
 * Atrasadas: pela semana em que venceram; as mais antigas entram em "Antes".
 */
export function weekly(rows: Row[], schema: ColumnSchema[], kind: Exclude<ChartKind, "group">, today: string, weeks = 8): Week[] {
  const first = iso(parse(monday(today)) - (weeks - 1) * 7 * DAY);
  const starts = Array.from({ length: weeks }, (_, i) => iso(parse(first) + i * 7 * DAY));
  const counts = new Map(starts.map((s) => [s, 0]));
  let before = 0;
  const due = dueColumn(schema);
  for (const r of rows) {
    let day: string | null = null;
    if (kind === "overdue_weeks") day = isOverdue(schema, r, today) && due ? dueOf(r.row_properties?.[due.id]) : null;
    else day = r.created_at ? String(r.created_at).slice(0, 10) : null;
    if (!day) continue;
    const w = monday(day);
    if (counts.has(w)) counts.set(w, counts.get(w)! + 1);
    else if (w < first) before++;
  }
  const out = starts.map((s) => ({ label: short(s), value: counts.get(s)! }));
  return kind === "overdue_weeks" && before ? [{ label: "Antes", value: before }, ...out] : out;
}

/** Gráficos iniciais: por status, por responsável e atrasadas por semana, conforme as colunas do banco. */
export function defaultCharts(schema: ColumnSchema[]): ChartConfig[] {
  const status = schema.find((c) => c.type === "status") ?? schema.find((c) => c.type === "select");
  const person = schema.find((c) => c.type === "person");
  return [
    ...(status ? [{ id: "c_status", kind: "group" as const, col: status.id }] : []),
    ...(person ? [{ id: "c_person", kind: "group" as const, col: person.id }] : []),
    ...(dueColumn(schema) ? [{ id: "c_overdue", kind: "overdue_weeks" as const }] : []),
  ];
}

export function chartTitle(c: ChartConfig, schema: ColumnSchema[]) {
  if (c.kind === "overdue_weeks") return "Atrasadas por semana do prazo";
  if (c.kind === "created_weeks") return "Criadas por semana";
  return `Por ${(schema.find((x) => x.id === c.col)?.name ?? "coluna").toLowerCase()}`;
}
