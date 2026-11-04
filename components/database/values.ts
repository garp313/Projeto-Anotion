import { evalFormula } from "./formula";
import type {
  ColumnSchema, DatabaseRow, DatabaseViewConfig, DateValue, Filter, FilterOp, NumberFormat, PropType, RollupFn,
} from "./types";

export type RelatedDb = { schema: ColumnSchema[]; rows: DatabaseRow[] };
export type Ctx = {
  schema: ColumnSchema[];
  related: Record<string, RelatedDb>;
  userLabel: (id?: string | null) => string;
};

export const asDate = (v: any): DateValue | null =>
  !v ? null : typeof v === "string" ? { start: v } : v.start ? v : null;

export const parseDay = (s: string) => new Date(s.length === 10 ? `${s}T00:00:00` : s);

export function formatDateValue(v: any): string {
  const d = asDate(v);
  if (!d) return "";
  const f = (s: string) => {
    const x = parseDay(s);
    const day = x.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    return d.time ? `${day} ${x.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : day;
  };
  return d.end ? `${f(d.start)} → ${f(d.end)}` : f(d.start);
}

export function formatNumber(n: any, fmt: NumberFormat = "number"): string {
  if (n === null || n === undefined || n === "" || Number.isNaN(Number(n))) return "";
  const v = Number(n);
  switch (fmt) {
    case "comma": return v.toLocaleString("pt-BR");
    case "percent": return `${v.toLocaleString("pt-BR")}%`;
    case "real": return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    case "dollar": return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
    case "euro": return v.toLocaleString("pt-BR", { style: "currency", currency: "EUR" });
    default: return String(v);
  }
}

const optionLabel = (col: ColumnSchema, id: any) => col.options?.find((o) => o.id === id || o.value === id)?.value ?? "";

/** Vencido em vermelho, vencendo hoje em laranja; item concluído não alerta. */
export function dueTone(col: ColumnSchema, row: DatabaseRow, ctx: Ctx): string {
  if (col.type !== "date") return "";
  const status = ctx.schema.find((c) => c.type === "status");
  if (!status) return "";
  if (status.options?.find((o) => o.id === row.row_properties?.[status.id])?.group === "complete") return "";
  const d = asDate(row.row_properties?.[col.id]);
  if (!d) return "";
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const due = (d.end ?? d.start).slice(0, 10);
  return due < today ? "text-red-500 font-medium" : due === today ? "text-orange-500 font-medium" : "";
}

export const isBlank = (v: any) =>
  v === null || v === undefined || v === "" || v === false || (Array.isArray(v) && v.length === 0);

export function aggregate(fn: RollupFn, vals: any[], show: (v: any) => string): any {
  const filled = vals.filter((v) => !isBlank(v));
  const nums = filled.map(Number).filter((n) => !Number.isNaN(n));
  const pct = (n: number) => (vals.length ? `${Math.round((n / vals.length) * 100)}%` : "0%");
  const times = filled.map((v) => parseDay(asDate(v)?.start ?? String(v)).getTime()).filter((t) => !Number.isNaN(t));
  const total = nums.reduce((a, b) => a + b, 0);
  switch (fn) {
    case "show_original": return vals.map(show).filter(Boolean).join(", ");
    case "count": return vals.length;
    case "count_values": case "not_empty": return filled.length;
    case "count_unique": return new Set(filled.map((v) => JSON.stringify(v))).size;
    case "empty": return vals.length - filled.length;
    case "percent_empty": return pct(vals.length - filled.length);
    case "percent_not_empty": return pct(filled.length);
    case "sum": return total;
    case "average": return nums.length ? total / nums.length : "";
    case "median": {
      const s = [...nums].sort((a, b) => a - b), m = s.length >> 1;
      return !s.length ? "" : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    case "min": return nums.length ? Math.min(...nums) : "";
    case "max": return nums.length ? Math.max(...nums) : "";
    case "range": return nums.length ? Math.max(...nums) - Math.min(...nums) : "";
    case "earliest": return times.length ? new Date(Math.min(...times)).toLocaleDateString("pt-BR") : "";
    case "latest": return times.length ? new Date(Math.max(...times)).toLocaleDateString("pt-BR") : "";
    default: return "";
  }
}

function rollupValue(col: ColumnSchema, row: DatabaseRow, ctx: Ctx): any {
  const cfg = col.rollup;
  if (!cfg) return "";
  const rel = ctx.schema.find((s) => s.id === cfg.relationProp);
  const db = rel?.relationDatabaseId ? ctx.related[rel.relationDatabaseId] : undefined;
  const target = db?.schema.find((s) => s.id === cfg.targetProp);
  if (!db || !target) return "";
  const ids: string[] = row.row_properties?.[cfg.relationProp] ?? [];
  const sub: Ctx = { ...ctx, schema: db.schema };
  const vals = db.rows.filter((r) => ids.includes(r.id)).map((r) => rawValue(target, r, sub));
  if (cfg.fn === "percent_complete") {
    const done = vals.filter((v) => target.options?.find((o) => o.id === v)?.group === "complete").length;
    return vals.length ? `${Math.round((done / vals.length) * 100)}%` : "0%";
  }
  return aggregate(cfg.fn, vals, (v) => displayText(target, v, sub));
}

/** Valor bruto da propriedade, já resolvendo os tipos calculados. */
export function rawValue(col: ColumnSchema, row: DatabaseRow, ctx: Ctx): any {
  switch (col.type) {
    case "title": return row.title;
    case "created_time": return row.created_at;
    case "last_edited_time": return row.updated_at;
    case "created_by": return ctx.userLabel(row.created_by);
    case "last_edited_by": return ctx.userLabel(row.last_edited_by);
    case "unique_id": return row.seq ?? null;
    case "rollup": return rollupValue(col, row, ctx);
    case "formula": {
      const r = evalFormula(col.formula ?? "", (name) => {
        const p = ctx.schema.find((s) => s.name === name);
        if (!p) throw new Error(`Propriedade não encontrada: ${name}`);
        if (p.id === col.id) throw new Error("A fórmula referencia a si mesma");
        const v = rawValue(p, row, ctx);
        if (p.type === "date") return asDate(v) ? parseDay(asDate(v)!.start) : "";
        if (p.type === "created_time" || p.type === "last_edited_time") return v ? new Date(v) : "";
        if (p.type === "select" || p.type === "status") return optionLabel(p, v);
        if (p.type === "multi_select") return (v ?? []).map((id: string) => optionLabel(p, id));
        if (p.type === "person") return (v ?? []).map((x: any) => x.name);
        if (p.type === "number") return v ?? 0;
        if (p.type === "checkbox") return Boolean(v);
        return v ?? "";
      });
      return r.error ? { __error: r.error } : r.value;
    }
    default: {
      // Depois de trocar o tipo da propriedade o valor antigo pode ter outro formato.
      const v = row.row_properties?.[col.id];
      if (["multi_select", "person", "files", "relation", "checklist"].includes(col.type)) return Array.isArray(v) ? v : [];
      if (["text", "url", "email", "phone"].includes(col.type) && typeof v === "object") return "";
      if (col.type === "number" && Number.isNaN(Number(v))) return null;
      return v;
    }
  }
}

/** Texto usado para exibir, buscar, filtrar e agrupar. */
export function displayText(col: ColumnSchema, v: any, ctx: Ctx): string {
  if (v && typeof v === "object" && "__error" in v) return "Erro";
  if (isBlank(v) && col.type !== "number") return "";
  switch (col.type) {
    case "number": return formatNumber(v, col.numberFormat);
    case "select": case "status": return optionLabel(col, v);
    case "multi_select": return (v as string[]).map((id) => optionLabel(col, id)).filter(Boolean).join(", ");
    case "date": return formatDateValue(v);
    case "person": return (v as any[]).map((p) => p.name).join(", ");
    case "files": return (v as any[]).map((f) => f.name).join(", ");
    case "checkbox": return v ? "Sim" : "";
    case "checklist": return `${(v as any[]).filter((i) => i.done).length}/${(v as any[]).length}`;
    case "created_time": case "last_edited_time":
      return new Date(v).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" });
    case "unique_id": return `${col.idPrefix ? `${col.idPrefix}-` : ""}${v}`;
    case "relation": {
      const db = col.relationDatabaseId ? ctx.related[col.relationDatabaseId] : undefined;
      return (v as string[]).map((id) => db?.rows.find((r) => r.id === id)?.title || "Sem título").join(", ");
    }
    default:
      if (v instanceof Date) return v.toLocaleDateString("pt-BR");
      if (typeof v === "boolean") return v ? "Sim" : "Não";
      if (typeof v === "number") return v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
      return String(v);
  }
}

export function opsFor(type: PropType): FilterOp[] {
  switch (type) {
    case "number": case "unique_id": return ["is", "is_not", "gt", "lt", "gte", "lte", "empty", "not_empty"];
    case "checkbox": return ["checked", "unchecked"];
    case "date": case "created_time": case "last_edited_time": return ["is", "before", "after", "empty", "not_empty"];
    case "select": case "status": return ["is", "is_not", "empty", "not_empty"];
    case "multi_select": case "person": case "relation": case "files": case "checklist": return ["contains", "not_contains", "empty", "not_empty"];
    default: return ["contains", "not_contains", "is", "is_not", "starts_with", "ends_with", "empty", "not_empty"];
  }
}
export const OP_LABEL: Record<FilterOp, string> = {
  contains: "Contém", not_contains: "Não contém", is: "É", is_not: "Não é", starts_with: "Começa com",
  ends_with: "Termina com", empty: "Está vazio", not_empty: "Não está vazio", gt: ">", lt: "<", gte: "≥", lte: "≤",
  before: "Antes de", after: "Depois de", checked: "Marcada", unchecked: "Desmarcada",
};
export const opNeedsValue = (op: FilterOp) => !["empty", "not_empty", "checked", "unchecked"].includes(op);

const dayKey = (v: any) => {
  const d = asDate(v);
  return d ? d.start.slice(0, 10) : "";
};
const DATE_TYPES: PropType[] = ["date", "created_time", "last_edited_time"];

function matches(f: Filter, row: DatabaseRow, ctx: Ctx): boolean {
  const col = ctx.schema.find((s) => s.id === f.prop);
  if (!col) return true;
  const v = rawValue(col, row, ctx);
  if (f.op === "checked") return Boolean(v);
  if (f.op === "unchecked") return !v;
  if (f.op === "empty") return isBlank(v);
  if (f.op === "not_empty") return !isBlank(v);
  if (f.value === undefined || f.value === "" || f.value === null) return true; // filtro ainda sem valor
  if (DATE_TYPES.includes(col.type)) {
    const a = dayKey(v), b = String(f.value);
    if (!a) return false;
    return f.op === "before" ? a < b : f.op === "after" ? a > b : a === b;
  }
  if (col.type === "select" || col.type === "status") return f.op === "is" ? v === f.value : v !== f.value;
  if (col.type === "number" || col.type === "unique_id") {
    if (v === null || v === undefined) return false;
    const a = Number(v), b = Number(f.value);
    switch (f.op) {
      case "is": return a === b;
      case "is_not": return a !== b;
      case "gt": return a > b;
      case "lt": return a < b;
      case "gte": return a >= b;
      case "lte": return a <= b;
      default: return true;
    }
  }
  const a = displayText(col, v, ctx).toLowerCase(), b = String(f.value).toLowerCase();
  switch (f.op) {
    case "contains": return a.includes(b);
    case "not_contains": return !a.includes(b);
    case "is": return a === b;
    case "is_not": return a !== b;
    case "starts_with": return a.startsWith(b);
    case "ends_with": return a.endsWith(b);
    default: return true;
  }
}

function sortKey(col: ColumnSchema, v: any, ctx: Ctx): number | string {
  if (col.type === "select" || col.type === "status") return col.options?.findIndex((o) => o.id === v) ?? -1;
  if (col.type === "number" || col.type === "unique_id") return v === null || v === undefined ? -Infinity : Number(v);
  if (col.type === "checkbox") return v ? 1 : 0;
  if (DATE_TYPES.includes(col.type)) return asDate(v)?.start ?? "";
  if (typeof v === "number") return v;
  return displayText(col, v, ctx).toLowerCase();
}

export function applyView(
  rows: DatabaseRow[],
  view: Pick<DatabaseViewConfig, "filters" | "filterMode" | "sorts">,
  ctx: Ctx,
  search = ""
): DatabaseRow[] {
  let out = rows;
  if (view.filters.length) {
    out = out.filter((r) =>
      view.filterMode === "or" ? view.filters.some((f) => matches(f, r, ctx)) : view.filters.every((f) => matches(f, r, ctx))
    );
  }
  const q = search.trim().toLowerCase();
  if (q) out = out.filter((r) => ctx.schema.some((c) => displayText(c, rawValue(c, r, ctx), ctx).toLowerCase().includes(q)));
  const cols = view.sorts.map((s) => ({ s, col: ctx.schema.find((c) => c.id === s.prop) })).filter((x) => x.col);
  if (cols.length) {
    out = [...out].sort((a, b) => {
      for (const { s, col } of cols) {
        const x = sortKey(col!, rawValue(col!, a, ctx), ctx), y = sortKey(col!, rawValue(col!, b, ctx), ctx);
        if (x === y) continue;
        const r = x < y ? -1 : 1;
        return s.dir === "asc" ? r : -r;
      }
      return a.position - b.position;
    });
  }
  return out;
}

/** Propriedades visíveis na ordem da visão; título sempre primeiro. */
export function visibleProps(schema: ColumnSchema[], view: DatabaseViewConfig): ColumnSchema[] {
  const order = view.order ?? [];
  const rank = (c: ColumnSchema) => {
    const i = order.indexOf(c.id);
    return i < 0 ? order.length + schema.indexOf(c) : i;
  };
  return schema
    .filter((c) => c.type === "title" || !view.hidden.includes(c.id))
    .sort((a, b) => (a.type === "title" ? -1 : b.type === "title" ? 1 : rank(a) - rank(b)));
}

export type Group = { id: string; label: string; color?: string; rows: DatabaseRow[] };

export function groupRows(rows: DatabaseRow[], col: ColumnSchema | undefined, ctx: Ctx): Group[] {
  if (!col) return [{ id: "__all", label: "", rows }];
  const none: Group = { id: "__none", label: `Sem ${col.name}`, rows: [] };
  if (col.type === "select" || col.type === "status" || col.type === "multi_select") {
    const gs: Group[] = (col.options ?? []).map((o) => ({ id: o.id, label: o.value, color: o.color, rows: [] }));
    for (const r of rows) {
      const v = rawValue(col, r, ctx);
      const ids = Array.isArray(v) ? v : v ? [v] : [];
      const hit = gs.filter((g) => ids.includes(g.id) || ids.includes(g.label));
      if (hit.length) hit.forEach((g) => g.rows.push(r));
      else none.rows.push(r);
    }
    return [none, ...gs];
  }
  const map = new Map<string, Group>();
  for (const r of rows) {
    const label = displayText(col, rawValue(col, r, ctx), ctx);
    if (!label) { none.rows.push(r); continue; }
    if (!map.has(label)) map.set(label, { id: label, label, rows: [] });
    map.get(label)!.rows.push(r);
  }
  return [none, ...map.values()];
}
