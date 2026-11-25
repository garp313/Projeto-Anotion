// Automações de banco de dados: "quando X acontecer, faça Y". Ficam em row_properties.__automations do banco.
// O plano é puro (testável) e serve à tela, à IA e ao cron; aplicar usa o cliente Supabase de quem chama.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ColumnSchema, DateValue } from "@/components/database/types";
import { fold } from "@/lib/import/parsers";

export type Trigger =
  /** Uma coluna de status, seleção ou caixa passou a ter este valor. */
  | { type: "changed_to"; col: string; value: string | boolean }
  /** Uma linha nova foi criada. */
  | { type: "created" }
  /** O prazo (coluna de data) venceu sem a linha estar concluída. Roda no cron diário. */
  | { type: "overdue"; col: string };

export type Action =
  | { type: "set_today"; col: string }
  | { type: "set_value"; col: string; value: string | boolean | null }
  /** Avisa no Inbox (e por e-mail, se marcado) as pessoas de uma coluna ou quem criou a linha. */
  | { type: "notify"; to: "people" | "creator"; col?: string; email: boolean };

export type Automation = {
  id: string;
  name: string;
  enabled: boolean;
  when: Trigger;
  then: Action[];
  /** Quem criou a regra: no cron, o e-mail sai do Gmail dessa pessoa. */
  author?: string;
};

export type Notice = { rule: string; targets: string[]; email: boolean; message: string };
export type Plan = { props: Record<string, any>; notices: Notice[]; fired: string[] };

type Row = { id: string; title: string; row_properties: Record<string, any>; created_by?: string | null };

export const automationsOf = (db?: { row_properties?: Record<string, any> | null } | null): Automation[] =>
  Array.isArray(db?.row_properties?.__automations) ? db!.row_properties!.__automations : [];

const DONE = ["concluido", "concluida", "feito", "feita", "done", "finalizado", "finalizada", "entregue", "encerrado", "cancelado"];

/** A linha está concluída? Status no grupo "concluído", opção com nome de concluído ou caixa marcada chamada Concluído/Feito. */
export function isDone(schema: ColumnSchema[], props: Record<string, any>) {
  for (const c of schema) {
    const v = props?.[c.id];
    if ((c.type === "status" || c.type === "select") && v) {
      const o = c.options?.find((x) => x.id === v);
      if (o && (o.group === "complete" || DONE.includes(fold(o.value)))) return true;
    }
    if (c.type === "checkbox" && v === true && DONE.some((d) => fold(c.name).startsWith(d.slice(0, 6)))) return true;
  }
  return false;
}

/** Coluna de prazo: a de data com nome de prazo; sem ela, a primeira de data. */
export function dueColumn(schema: ColumnSchema[]) {
  const dates = schema.filter((c) => c.type === "date");
  return dates.find((c) => /prazo|entrega|venc|data|fim|termino|deadline/.test(fold(c.name))) ?? dates[0];
}

const empty = (): Plan => ({ props: {}, notices: [], fired: [] });
const label = (row: Row) => `“${row.title?.trim() || "Sem título"}”`;

/** Quem recebe o aviso: ids de conta das pessoas da coluna, ou quem criou a linha. */
function targetsOf(action: Extract<Action, { type: "notify" }>, row: Row, props: Record<string, any>): string[] {
  if (action.to === "creator") return row.created_by ? [row.created_by] : [];
  const people: any[] = Array.isArray(props[action.col ?? ""]) ? props[action.col!] : [];
  return [...new Set(people.map((p) => p?.id).filter((id): id is string => typeof id === "string"))];
}

/** Junta as ações das regras disparadas. Uma ação não dispara outra regra: evita laço. */
function run(rules: Automation[], row: Row, after: Record<string, any>, today: string, why: (r: Automation) => string): Plan {
  const plan = empty();
  for (const rule of rules) {
    plan.fired.push(rule.id);
    for (const a of rule.then) {
      if (a.type === "set_today") plan.props[a.col] = { start: today } satisfies DateValue;
      else if (a.type === "set_value") plan.props[a.col] = a.value;
      else {
        const targets = targetsOf(a, row, { ...after, ...plan.props });
        if (targets.length) plan.notices.push({ rule: rule.id, targets, email: a.email, message: `${rule.name}: ${label(row)} ${why(rule)}`.slice(0, 300) });
      }
    }
  }
  return plan;
}

const valueLabel = (schema: ColumnSchema[], t: Extract<Trigger, { type: "changed_to" }>) => {
  const col = schema.find((c) => c.id === t.col);
  if (typeof t.value === "boolean") return t.value ? "foi marcada" : "foi desmarcada";
  return `passou para ${col?.options?.find((o) => o.id === t.value)?.value ?? "o valor escolhido"}`;
};

/** Uma coluna mudou: dispara as regras "quando mudar para". */
export function planChange(rules: Automation[], schema: ColumnSchema[], row: Row, colId: string, before: any, after: any, today: string): Plan {
  if (before === after) return empty();
  // Caixa: vazio conta como desmarcada. Só dispara na passagem para o valor, não quando já estava nele.
  const norm = (v: any, want: string | boolean) => (typeof want === "boolean" ? Boolean(v) : v);
  const hits = rules.filter((r) => r.enabled && r.when.type === "changed_to" && r.when.col === colId
    && norm(after, r.when.value) === r.when.value && norm(before, r.when.value) !== r.when.value);
  if (!hits.length) return empty();
  return run(hits, row, { ...row.row_properties, [colId]: after }, today, (r) => valueLabel(schema, r.when as Extract<Trigger, { type: "changed_to" }>));
}

/** Linha nova: dispara as regras "quando criar". */
export function planCreate(rules: Automation[], row: Row, today: string): Plan {
  const hits = rules.filter((r) => r.enabled && r.when.type === "created");
  return hits.length ? run(hits, row, row.row_properties, today, () => "foi criada") : empty();
}

/** Dia em que vence: o fim do intervalo, ou o início. Fim em aberto não vence. */
export function dueOf(v: any): string | null {
  const d = v as DateValue | null;
  if (!d?.start || d.openEnd) return null;
  return String(d.end ?? d.start).slice(0, 10);
}

/** Prazo vencido e ainda não avisado por esta regra. `done` diz se a linha já foi concluída. */
export function planOverdue(rules: Automation[], row: Row, today: string, done: boolean): Plan & { mark: Record<string, string> } {
  const sent: Record<string, string> = row.row_properties?.__overdue ?? {};
  const hits = rules.filter((r) => {
    if (!r.enabled || r.when.type !== "overdue" || done) return false;
    const due = dueOf(row.row_properties?.[r.when.col]);
    return Boolean(due && due < today && sent[r.id] !== due);
  });
  const plan = hits.length ? run(hits, row, row.row_properties, today, () => "está atrasada") : empty();
  const mark = { ...sent };
  for (const r of hits) mark[r.id] = dueOf(row.row_properties[(r.when as Extract<Trigger, { type: "overdue" }>).col])!;
  return { ...plan, mark };
}

/** Grava os valores e cria os avisos com a sessão de quem agiu. Devolve se algum aviso pede e-mail. */
export async function applyPlan(sb: SupabaseClient, rowId: string, plan: Plan): Promise<{ email: boolean }> {
  for (const [key, value] of Object.entries(plan.props)) {
    const { error } = await sb.rpc("set_row_prop", { p_page: rowId, p_key: key, p_value: value });
    if (error) console.warn("automação: valor não gravado", error.message);
  }
  let email = false;
  for (const n of plan.notices) {
    const { error } = await sb.rpc("automation_notify", { p_page: rowId, p_targets: n.targets, p_message: n.message, p_email: n.email });
    if (error) console.warn("automação: aviso não criado", error.message);
    else email ||= n.email;
  }
  return { email };
}

// ---------------------------------------------------------------- textos da tela

export const TRIGGER_LABEL: Record<Trigger["type"], string> = {
  changed_to: "Quando uma coluna mudar para",
  created: "Quando uma linha for criada",
  overdue: "Quando o prazo vencer",
};

export const ACTION_LABEL: Record<Action["type"], string> = {
  set_today: "Preencher data com hoje",
  set_value: "Definir valor",
  notify: "Avisar pessoas",
};
