import type { ColumnSchema, FileValue, PersonValue, PropType, SelectOption } from "@/components/database/types";
import { COLORS, READ_ONLY } from "@/components/database/types";
import type { NotionDb } from "./notionZip";
import { fold, isEmail, isUrl, nameMatch, parseCheckbox, parseDate, parseMulti, parseNumber, parsePercent, parseRelation } from "./parsers";

export type Member = { id: string; name: string; email: string };

export type ColumnDest =
  | { kind: "title" }
  | { kind: "ignore" }
  | { kind: "existing"; colId: string; part?: "start" | "end" }
  | { kind: "new"; type: PropType; name: string; part?: "start" | "end"; format?: "percent" };

export type ColumnPlan = { source: string; detected: PropType; samples: string[]; dest: ColumnDest };

/** Valor de seleção ou status: vai para a opção de nome `to`; igual ao original quer dizer criar. */
export type ValuePlan = Record<string, Record<string, string>>;

export type PersonPlan = { kind: "member"; id: string; name: string } | { kind: "text" } | { kind: "invite"; email: string };

export type DbPlan = {
  db: NotionDb;
  target: { kind: "new"; title: string } | { kind: "existing"; id: string };
  columns: ColumnPlan[];
  values: ValuePlan;
  people: Record<string, PersonPlan>;
  sendToTasks: boolean;
};

export type Issue = { row: number; column: string; value: string; reason: string };

const TITLE_NAMES = /^(nome|name|titulo|title|tarefa|demanda|projeto|nome do projeto|task)$/;
const PERSON_NAMES = /respons|equipe|pessoa|assignee|owner|dono|participante/;
const STATUS_NAMES = /^(status|situacao|estado)$/;
const FILE_NAMES = /anexo|arquivo|attachment|files?\b/;
const START_NAMES = /^(inicio|data de inicio|data inicio|start|start date)$/;
const END_NAMES = /^(fim|data de fim|data fim|termino|end|end date|entrega|prazo final)$/;

const filled = (db: NotionDb, col: string) => db.rows.map((r) => (r[col] ?? "").trim()).filter(Boolean);
const most = (values: string[], test: (v: string) => boolean) => values.length > 0 && values.filter(test).length / values.length >= 0.8;

export const OUTSIDERS = "Responsáveis (Notion)";

export function detectType(name: string, values: string[]): PropType {
  const n = fold(name);
  // Colunas criadas pela própria importação são texto: voltam assim num export daqui.
  if (n === fold(OUTSIDERS) || n === fold("Notas de importação")) return "text";
  if (PERSON_NAMES.test(n)) return "person";
  if (STATUS_NAMES.test(n)) return "status";
  if (FILE_NAMES.test(n)) return "files";
  if (!values.length) return "text";
  if (values.some((v) => /notion\.so\/\S*[0-9a-f]{32}/i.test(v))) return "relation";
  if (most(values, (v) => parseDate(v) !== null)) return "date";
  if (most(values, (v) => /^-?[\d.,]+\s*%$/.test(v.trim()))) return "number";
  if (most(values, (v) => ["yes", "no", "sim", "nao", "true", "false"].includes(fold(v)))) return "checkbox";
  if (most(values, isUrl)) return "url";
  if (most(values, isEmail)) return "email";
  if (most(values, (v) => parseNumber(v) !== null && /^[-\d.,\sR$]+$/.test(v))) return "number";
  const parts = values.flatMap(parseMulti);
  const distinct = new Set(parts.map(fold)).size;
  if (values.some((v) => v.includes(",")) && distinct <= Math.max(12, parts.length / 2)) return "multi_select";
  if (distinct <= Math.max(12, values.length / 3)) return "select";
  return "text";
}

/** Sinônimos do próprio time: nomes diferentes no Notion e aqui. */
const SYNONYMS: [RegExp, RegExp][] = [
  [PERSON_NAMES, /respons/],
  [/^prioridade$/, /^prioridade$/],
];

function existingFor(name: string, type: PropType, schema: ColumnSchema[]) {
  const n = fold(name);
  const same = schema.find((c) => fold(c.name) === n && !READ_ONLY.includes(c.type));
  if (same) return same;
  const pair = SYNONYMS.find(([from]) => from.test(n));
  return pair ? schema.find((c) => pair[1].test(fold(c.name)) && c.type === type) : undefined;
}

export function suggestColumns(db: NotionDb, schema: ColumnSchema[]): ColumnPlan[] {
  const dateCol = schema.find((c) => c.type === "date");
  const hasRange = db.headers.some((h) => START_NAMES.test(fold(h))) && db.headers.some((h) => END_NAMES.test(fold(h)));
  return db.headers.map((source, i) => {
    const values = filled(db, source);
    const samples = [...new Set(values)].slice(0, 5);
    const n = fold(source);
    const detected = detectType(source, values);
    const part = hasRange ? (START_NAMES.test(n) ? "start" : END_NAMES.test(n) ? "end" : undefined) : undefined;
    let dest: ColumnDest;
    if (i === 0 || (TITLE_NAMES.test(n) && !db.headers.slice(0, i).some((h) => TITLE_NAMES.test(fold(h))))) dest = { kind: "title" };
    else if (part) dest = dateCol ? { kind: "existing", colId: dateCol.id, part } : { kind: "new", type: "date", name: "Período", part };
    else {
      const found = existingFor(source, detected, schema);
      const percent = detected === "number" && values.some((v) => v.includes("%"));
      dest = found ? { kind: "existing", colId: found.id }
        : { kind: "new", type: detected, name: source, ...(percent ? { format: "percent" as const } : {}) };
    }
    return { source, detected, samples, dest };
  });
}

const STATUS_HINTS: [RegExp, RegExp][] = [
  [/em atendimento/, /em andamento/],
  [/pausado|parado/, /bloquead/],
  [/nao iniciado|nao comecou/, /a fazer/],
];

/** Sugere para cada valor a opção existente; sem opção parecida, mantém o valor e cria. */
export function suggestValues(db: NotionDb, columns: ColumnPlan[], schema: ColumnSchema[]): ValuePlan {
  const out: ValuePlan = {};
  for (const c of columns) {
    const col = c.dest.kind === "existing" ? schema.find((s) => s.id === (c.dest as { colId: string }).colId) : undefined;
    const type = col?.type ?? (c.dest.kind === "new" ? c.dest.type : null);
    if (!type || !["select", "status", "multi_select"].includes(type)) continue;
    const seen = new Set(db.rows.flatMap((r) => (type === "multi_select" ? parseMulti(r[c.source] ?? "") : [(r[c.source] ?? "").trim()])).filter(Boolean));
    out[c.source] = {};
    for (const value of seen) {
      const same = col?.options?.find((o) => fold(o.value) === fold(value));
      const hint = col && STATUS_HINTS.find(([from]) => from.test(fold(value)));
      const similar = hint ? col!.options?.find((o) => hint[1].test(fold(o.value))) : undefined;
      out[c.source][value] = same?.value ?? similar?.value ?? value;
    }
  }
  return out;
}

export function suggestPeople(db: NotionDb, columns: ColumnPlan[], schema: ColumnSchema[], members: Member[]) {
  const out: Record<string, PersonPlan> = {};
  const personCols = columns.filter((c) => {
    if (c.dest.kind === "new") return c.dest.type === "person";
    return c.dest.kind === "existing" && schema.find((s) => s.id === (c.dest as { colId: string }).colId)?.type === "person";
  });
  for (const c of personCols) {
    for (const name of db.rows.flatMap((r) => parseMulti(r[c.source] ?? ""))) {
      if (out[name]) continue;
      const exact = members.find((m) => nameMatch(name, m.name) === "exact" || fold(name) === fold(m.email));
      const partial = members.filter((m) => nameMatch(name, m.name) === "partial");
      const m = exact ?? (partial.length === 1 ? partial[0] : undefined);
      out[name] = m ? { kind: "member", id: m.id, name: m.name || m.email } : { kind: "text" };
    }
  }
  return out;
}

/** Colunas e opções que o banco de destino precisa ganhar para receber o plano. */
export function applyToSchema(plan: DbPlan, schema: ColumnSchema[], newId: (p: string) => string) {
  const next: ColumnSchema[] = schema.map((c) => (c.options ? { ...c, options: [...c.options] } : { ...c }));
  const ids: Record<string, string> = {};
  const byName = new Map<string, ColumnSchema>();
  for (const c of plan.columns) {
    if (c.dest.kind === "existing") { ids[c.source] = c.dest.colId; continue; }
    if (c.dest.kind !== "new") continue;
    const key = `${c.dest.type}:${fold(c.dest.name)}`;
    let col = byName.get(key) ?? next.find((s) => fold(s.name) === fold((c.dest as { name: string }).name) && s.type === (c.dest as { type: PropType }).type);
    if (!col) {
      col = { id: newId("p_"), name: c.dest.name, type: c.dest.type, ...(c.dest.format ? { numberFormat: "percent" as const } : {}), ...(["select", "status", "multi_select"].includes(c.dest.type) ? { options: [] } : {}) };
      next.push(col);
    }
    byName.set(key, col);
    ids[c.source] = col.id;
  }
  for (const [source, values] of Object.entries(plan.values)) {
    const col = next.find((s) => s.id === ids[source]);
    if (!col) continue;
    for (const label of new Set(Object.values(values))) {
      if (col.options?.some((o) => fold(o.value) === fold(label))) continue;
      const option: SelectOption = {
        id: newId("o_"), value: label, color: COLORS[((col.options?.length ?? 0) + 1) % COLORS.length].cls,
        ...(col.type === "status" ? { group: /conclu|feito|done/i.test(label) ? "complete" as const : /andamento|atendimento|pausad|bloque/i.test(label) ? "in_progress" as const : "todo" as const } : {}),
      };
      col.options = [...(col.options ?? []), option];
    }
  }
  const textCol = Object.values(plan.people).some((p) => p.kind !== "member") ? OUTSIDERS : null;
  if (textCol && !next.some((c) => c.name === textCol && c.type === "text")) next.push({ id: newId("p_"), name: textCol, type: "text" });
  return { schema: next, ids, notes: next.find((c) => c.name === "Notas de importação") };
}

export const NOTES = "Notas de importação";

export type ConvertedRow = {
  title: string; props: Record<string, any>;
  relations: { colId: string; items: { title: string; id: string | null }[] }[];
  issues: Issue[];
};

/** Converte uma linha do CSV para as propriedades do banco. Valor que não dá para ler nunca some. */
export function convertRow(plan: DbPlan, row: Record<string, string>, index: number, schema: ColumnSchema[], ids: Record<string, string>): ConvertedRow {
  const props: Record<string, any> = {};
  const issues: Issue[] = [];
  const relations: ConvertedRow["relations"] = [];
  const notes: string[] = [];
  const outsiders: string[] = [];
  let title = "";
  const range: Record<string, { start?: string; end?: string; time?: boolean }> = {};
  const fail = (column: string, value: string, reason: string) => { issues.push({ row: index + 2, column, value, reason }); notes.push(`${column}: ${value}`); };

  for (const c of plan.columns) {
    const raw = (row[c.source] ?? "").trim();
    if (c.dest.kind === "ignore") continue;
    if (c.dest.kind === "title") { title = raw; continue; }
    if (!raw) continue;
    const col = schema.find((s) => s.id === ids[c.source]);
    if (!col) continue;
    const part = "part" in c.dest ? c.dest.part : undefined;
    const option = (v: string) => col.options?.find((o) => fold(o.value) === fold(plan.values[c.source]?.[v] ?? v))?.id;

    switch (col.type) {
      case "date": {
        const d = parseDate(raw);
        if (!d) { fail(c.source, raw, "Data não reconhecida"); break; }
        if (part) { (range[col.id] ??= {})[part] = d.start; if (d.time) range[col.id].time = true; }
        else props[col.id] = { start: d.start, end: d.end, ...(d.time ? { time: true } : {}) };
        break;
      }
      case "number": {
        const n = col.numberFormat === "percent" ? parsePercent(raw) : parseNumber(raw);
        if (n === null) fail(c.source, raw, "Número não reconhecido"); else props[col.id] = n;
        break;
      }
      case "select": case "status": {
        const id = option(raw);
        if (id) props[col.id] = id; else fail(c.source, raw, "Opção sem destino");
        break;
      }
      case "multi_select": props[col.id] = parseMulti(raw).map(option).filter(Boolean); break;
      case "checkbox": {
        const v = parseCheckbox(raw);
        if (v === null) fail(c.source, raw, "Valor de caixa não reconhecido"); else props[col.id] = v;
        break;
      }
      case "person": {
        const people: PersonValue[] = [];
        for (const name of parseMulti(raw)) {
          const p = plan.people[name];
          if (p?.kind === "member") { if (!people.some((x) => x.id === p.id)) people.push({ id: p.id, name: p.name }); }
          else outsiders.push(name);
        }
        if (people.length) props[col.id] = people;
        break;
      }
      case "files": {
        const items: FileValue[] = parseMulti(raw).map((v) => ({ name: v.replace(/^https?:\/\//, "").slice(0, 60), ...(isUrl(v) ? { url: v } : { path: undefined }) }));
        const links = items.filter((f) => f.url);
        if (links.length) props[col.id] = links;
        if (links.length < items.length) fail(c.source, raw, "Arquivo sem endereço");
        break;
      }
      case "relation": relations.push({ colId: col.id, items: parseRelation(raw) }); break;
      default: props[col.id] = raw;
    }
  }
  for (const [colId, r] of Object.entries(range)) {
    const start = r.start ?? r.end!;
    props[colId] = { start, end: r.start && r.end && r.end !== r.start ? r.end : null, ...(r.time ? { time: true } : {}) };
  }
  if (outsiders.length) {
    const col = schema.find((s) => s.name === OUTSIDERS && s.type === "text");
    if (col) props[col.id] = [...new Set(outsiders)].join(", ");
  }
  if (notes.length) {
    const col = schema.find((s) => s.name === NOTES);
    if (col) props[col.id] = notes.join(" | ");
  }
  return { title, props, relations, issues };
}
