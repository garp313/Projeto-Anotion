/**
 * Fontes conectadas: um banco (ex.: Tarefas) mostra as linhas de outros bancos sem copiá-las.
 * Aqui fica só a tradução de valores, sem tela nem rede, para dar para testar.
 */
import type { ColumnSchema, DatabaseRow, PersonValue, RowMirror, SelectOption, StatusGroup } from "./types";
import { displayText, isBlank, rawValue, relatedLabel, type Ctx } from "./values";

export type SourceRef = { id: string; databaseId: string; viewId?: string };
export type SourceMap = {
  /** Coluna daqui → colunas da fonte (Tags pode juntar várias). */
  fields: Record<string, string[]>;
  /** Opção de status da fonte → opção daqui. null = Sem status. */
  status: Record<string, string | null>;
  /** Linha do banco de pessoas da fonte → membro do time. null = sem par. */
  people: Record<string, string | null>;
};
export type Person = { id: string; name: string; email?: string };

export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// ---------- Status pelo grupo ----------

const GUESS: [RegExp, StatusGroup | "blocked"][] = [
  [/bloque|imped|travad|parad/, "blocked"],
  [/conclu|feito|done|finaliz|entregue|encerr|resolvid|complet/, "complete"],
  [/andamento|progress|fazendo|doing|execu|desenvolv|revis|valida|aguard|esper/, "in_progress"],
  [/a fazer|nao inici|to ?do|backlog|pendente|aberto|novo|planej|inicial/, "todo"],
];

/** Grupo de uma opção: o da própria opção (tipo Status) ou adivinhado pelo nome (Seleção comum). */
function groupOf(o: SelectOption): StatusGroup | "blocked" | null {
  const byName = GUESS.find(([re]) => re.test(norm(o.value)))?.[1] ?? null;
  if (byName === "blocked") return "blocked";
  return o.group ?? byName;
}

/** Opção daqui para uma opção da fonte: primeiro pelo nome igual, depois pelo grupo. */
export function suggestStatus(src: SelectOption, target: SelectOption[]): string | null {
  const same = target.find((t) => norm(t.value) === norm(src.value));
  if (same) return same.id;
  const g = groupOf(src);
  if (!g) return null;
  if (g === "blocked") return (target.find((t) => /bloque/.test(norm(t.value))) ?? target.find((t) => t.group === "in_progress"))?.id ?? null;
  // "Em andamento" antes de "Bloqueado": os dois são do grupo em andamento.
  return target.find((t) => t.group === g && !/bloque/.test(norm(t.value)))?.id ?? target.find((t) => t.group === g)?.id ?? null;
}

// ---------- Campos pelo nome e pelo tipo ----------

const COMPATIBLE: Partial<Record<ColumnSchema["type"], ColumnSchema["type"][]>> = {
  title: ["title"], status: ["status", "select"], select: ["select", "status"], multi_select: ["multi_select", "select"],
  person: ["person", "relation"], date: ["date"],
};
/** Colunas da fonte que podem alimentar uma coluna daqui. */
export const compatible = (target: ColumnSchema, src: ColumnSchema) =>
  (COMPATIBLE[target.type] ?? [target.type]).includes(src.type) && !["formula", "rollup"].includes(target.type);

const named = (cols: ColumnSchema[], re: RegExp) => cols.find((c) => re.test(norm(c.name)));

/** Sugestão inicial do mapeamento, como a pessoa faria olhando as duas tabelas. */
export function suggestFields(target: ColumnSchema[], source: ColumnSchema[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const used = new Set<string>();
  const take = (t: ColumnSchema, c?: ColumnSchema) => { if (c && !used.has(c.id)) { out[t.id] = [c.id]; used.add(c.id); } };
  const of = (...types: ColumnSchema["type"][]) => source.filter((c) => types.includes(c.type));
  for (const t of target) {
    if (t.sourceTag) continue;
    const n = norm(t.name);
    if (t.type === "title") take(t, source.find((c) => c.type === "title"));
    else if (t.type === "status") take(t, of("status")[0] ?? named(of("select"), /status|situa|etapa|fase/));
    else if (t.type === "person") take(t, named(of("person"), /respons|dono|owner|atribu/) ?? of("person")[0] ?? named(of("relation"), /respons|equipe|pessoa|atribu|dono|owner/));
    else if (t.type === "date" && /prazo|due|entrega|venc/.test(n)) {
      const dates = of("date");
      take(t, named(dates, /fim|prazo|entrega|due|deadline|termino|venc/) ?? (dates.length === 1 ? dates[0] : undefined));
    } else if (t.type === "select" && /priori/.test(n)) take(t, named(of("select", "status"), /priori/));
    else if (t.type === "multi_select" && /tag|etiqueta/.test(n)) {
      const cols = of("select", "multi_select").filter((c) => /setor|tag|ferrament|categ|etiqueta|area/.test(norm(c.name)) && !used.has(c.id));
      if (cols.length) { out[t.id] = cols.map((c) => c.id); cols.forEach((c) => used.add(c.id)); }
    }
  }
  // O resto: mesmo nome e mesmo tipo.
  for (const t of target) {
    if (out[t.id] || t.sourceTag || t.type === "relation") continue;
    take(t, source.find((c) => norm(c.name) === norm(t.name) && c.type === t.type));
  }
  return out;
}

/** Mapeamento em uso: o salvo pela pessoa, completado pelas sugestões para o que ainda não tem decisão. */
export function effectiveMap(saved: Partial<SourceMap> | undefined, target: ColumnSchema[], source: ColumnSchema[]): SourceMap {
  const fields = saved?.fields ?? suggestFields(target, source);
  const status: Record<string, string | null> = {};
  const tStatus = target.find((c) => c.type === "status");
  const sStatusId = tStatus ? fields[tStatus.id]?.[0] : undefined;
  const sStatus = source.find((c) => c.id === sStatusId);
  for (const o of sStatus?.options ?? []) {
    status[o.id] = saved?.status && o.id in saved.status ? saved.status[o.id] : suggestStatus(o, tStatus?.options ?? []);
  }
  return { fields, status, people: saved?.people ?? {} };
}

// ---------- Pessoas ----------

const tokens = (s: string) => norm(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w.length > 1 && !["da", "de", "do", "das", "dos", "e"].includes(w));

/** Mesmo nome? Ignora acento, maiúsculas e nomes do meio: "Thiago Costa" = "THIAGO DA SILVA COSTA". */
export function sameName(a: string, b: string) {
  const x = tokens(a), y = tokens(b);
  if (!x.length || !y.length) return false;
  if (x.join(" ") === y.join(" ")) return true;
  if (x.length < 2 || y.length < 2) return false;
  return x[0] === y[0] && x[x.length - 1] === y[y.length - 1];
}

/** Membro de um conjunto de nomes; dois membros parecidos = ninguém, para não chutar. */
export function matchMember(names: string[], members: Person[]): Person | null {
  const hits = members.filter((m) => names.some((n) => (m.name && sameName(n, m.name)) || (m.email && norm(n) === norm(m.email))));
  return hits.length === 1 ? hits[0] : null;
}

/** Nomes pelos quais uma linha do banco de pessoas é conhecida: o título e a coluna mostrada na relação. */
const namesOf = (col: ColumnSchema, row: DatabaseRow, ctx: Ctx) => [row.title, relatedLabel(col, row, ctx)].filter(Boolean);

// ---------- Leitura: fonte → aqui ----------

export type Unmatched = { status: string[]; people: { id: string; label: string }[] };

const optionOf = (col: ColumnSchema | undefined, v: unknown) => col?.options?.find((o) => o.id === v || o.value === v);
const toList = (v: unknown) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);

export function mirrorRow(args: {
  row: DatabaseRow; ref: SourceRef; label: string; map: SourceMap; target: ColumnSchema[]; sctx: Ctx;
  members: Person[]; editable: boolean; unmatched: Unmatched;
}): DatabaseRow {
  const { row, ref, label, map, target, sctx, members, editable, unmatched } = args;
  const source = sctx.schema;
  const props: Record<string, any> = {};
  const writable: string[] = [];
  const extras: RowMirror["extras"] = [];
  const used = new Set(Object.values(map.fields).flat());

  for (const t of target) {
    if (t.sourceTag) { props[t.id] = ref.id; continue; }
    const cols = (map.fields[t.id] ?? []).map((id) => source.find((c) => c.id === id)).filter((c): c is ColumnSchema => Boolean(c));
    if (!cols.length || t.type === "title") { if (t.type === "title" && cols.length) writable.push(t.id); continue; }
    const s = cols[0];
    const v = rawValue(s, row, sctx);

    if (t.type === "status") {
      const o = optionOf(s, v);
      const to = o ? map.status[o.id] ?? null : null;
      if (o && !to && !unmatched.status.includes(o.value)) unmatched.status.push(o.value);
      props[t.id] = to;
      writable.push(t.id);
    } else if (t.type === "select" || t.type === "multi_select") {
      // Opção sem par aqui não é criada: aparece só leitura no cartão.
      const names = cols.flatMap((c) => toList(rawValue(c, row, sctx)).map((x) => optionOf(c, x)?.value ?? String(x)));
      const ids: string[] = [];
      for (const n of names) {
        const hit = t.options?.find((o) => norm(o.value) === norm(n));
        if (hit) ids.push(hit.id); else extras.push({ name: t.name, text: n });
      }
      props[t.id] = t.type === "select" ? ids[0] ?? null : [...new Set(ids)];
      if (t.type === "select" && cols.length === 1) writable.push(t.id);
    } else if (t.type === "person" && s.type === "relation") {
      const people = s.relationDatabaseId ? sctx.related[s.relationDatabaseId]?.rows ?? [] : [];
      const out: PersonValue[] = [];
      for (const id of toList(v) as string[]) {
        const p = people.find((r) => r.id === id);
        if (!p) continue;
        const forced = map.people[p.id];
        const m = forced ? members.find((x) => x.id === forced) ?? null : forced === null ? null : matchMember(namesOf(s, p, sctx), members);
        const shown = relatedLabel(s, p, sctx) || p.title || "Sem nome";
        if (m) out.push({ id: m.id, name: m.name || m.email || shown });
        else { extras.push({ name: t.name, text: shown }); if (!unmatched.people.some((x) => x.id === p.id)) unmatched.people.push({ id: p.id, label: shown }); }
      }
      props[t.id] = out;
      writable.push(t.id);
    } else {
      props[t.id] = v ?? null;
      if (s.type === t.type && !["rollup", "formula", "relation", "created_time", "created_by", "last_edited_time", "last_edited_by", "unique_id"].includes(s.type)) writable.push(t.id);
    }
  }
  // Campos da fonte sem lugar aqui: só leitura no cartão.
  for (const c of source) {
    if (c.type === "title" || used.has(c.id)) continue;
    const v = rawValue(c, row, sctx);
    if (isBlank(v)) continue;
    const text = displayText(c, v, sctx);
    if (text) extras.push({ name: c.name, text });
  }

  return {
    ...row,
    row_properties: props,
    mirror: { sourceId: ref.id, databaseId: ref.databaseId, label, editable, writable: editable ? writable : [], extras: extras.slice(0, 8) },
  };
}

// ---------- Escrita: aqui → fonte ----------

export type Write = { col: string; value: unknown } | { error: string };

/** Traduz uma mudança feita aqui para a coluna e o valor da fonte. */
export function toSource(args: {
  colId: string; value: any; map: SourceMap; target: ColumnSchema[]; sctx: Ctx; members: Person[];
}): Write {
  const { colId, value, map, target, sctx, members } = args;
  const source = sctx.schema;
  const t = target.find((c) => c.id === colId);
  const s = source.find((c) => c.id === map.fields[colId]?.[0]);
  if (!t || !s) return { error: `“${t?.name ?? "Campo"}” não está ligado a nenhuma coluna da fonte.` };

  if (t.type === "title") return { col: s.id, value };
  if (t.type === "status") {
    if (value == null) return { col: s.id, value: null };
    const back = Object.entries(map.status).find(([, to]) => to === value)?.[0];
    const tOpt = t.options?.find((o) => o.id === value);
    const byGroup = tOpt ? s.options?.find((o) => suggestStatus(o, [tOpt]) === tOpt.id) : undefined;
    const id = back ?? byGroup?.id;
    return id ? { col: s.id, value: id } : { error: `“${tOpt?.value ?? "Status"}” não tem par na fonte. Ajuste em Revisar mapeamento.` };
  }
  if (t.type === "select") {
    if (value == null) return { col: s.id, value: null };
    const name = t.options?.find((o) => o.id === value)?.value ?? "";
    const hit = s.options?.find((o) => norm(o.value) === norm(name));
    return hit ? { col: s.id, value: hit.id } : { error: `A fonte não tem a opção “${name}” em “${s.name}”.` };
  }
  if (t.type === "person" && s.type === "relation") {
    const rows = s.relationDatabaseId ? sctx.related[s.relationDatabaseId]?.rows ?? [] : [];
    const ids: string[] = [];
    for (const p of (value ?? []) as PersonValue[]) {
      const forced = Object.entries(map.people).find(([, m]) => m === p.id)?.[0];
      const auto = rows.filter((r) => matchMember(namesOf(s, r, sctx), members)?.id === p.id);
      const id = forced ?? (auto.length === 1 ? auto[0].id : undefined);
      if (!id) return { error: `${p.name} não foi encontrado em “${s.name}” na fonte. Ajuste em Revisar mapeamento.` };
      ids.push(id);
    }
    return { col: s.id, value: ids };
  }
  return { col: s.id, value };
}

// ---------- Ligação entre o banco que mostra e as fontes carregadas ----------

/** O que cada fonte entrega ao banco que a mostra. */
export type Feed = {
  state: "loading" | "ok" | "missing";
  label: string;
  rows: DatabaseRow[];
  unmatched: Unmatched;
  /** Colunas da fonte, para a revisão do mapeamento. */
  schema: ColumnSchema[];
  /** Pessoas do banco de pessoas da fonte, para casar à mão. */
  viewName?: string;
  viewMissing?: boolean;
};
export const feedKey = (hostId: string, sourceId: string) => ["source_feed", hostId, sourceId] as const;

/** Grava uma mudança feita no banco que mostra; devolve o erro para avisar, ou null. */
type Writer = (rowId: string, colId: string, value: unknown) => string | null;
const writers = new Map<string, Writer>();
export const setWriter = (hostId: string, sourceId: string, w: Writer | null) => {
  const k = `${hostId}:${sourceId}`;
  if (w) writers.set(k, w); else writers.delete(k);
};
export const writeMirror = (hostId: string, sourceId: string, rowId: string, colId: string, value: unknown) =>
  writers.get(`${hostId}:${sourceId}`)?.(rowId, colId, value) ?? "A fonte ainda está carregando. Tente de novo em instantes.";
