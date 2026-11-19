// Tradução entre o que a IA escreve (texto) e o que o app guarda em cada tipo de coluna. Puro: testável.
import { COLORS, newId, type ColumnSchema, type DateValue, type PropType, type SelectOption } from "@/components/database/types";
import { fold, nameMatch, parseCheckbox, parseDate, parseMulti, parseNumber } from "@/lib/import/parsers";

export type Person = { id: string; name: string; email: string };

/** Tipos que a IA pode criar e preencher. Os calculados ficam com o app. */
export const AI_TYPES: Record<string, PropType> = {
  texto: "text", numero: "number", selecao: "select", selecao_multipla: "multi_select", status: "status",
  data: "date", pessoa: "person", caixa: "checkbox", url: "url", email: "email", telefone: "phone",
};
const TYPE_NAME = Object.fromEntries(Object.entries(AI_TYPES).map(([k, v]) => [v, k])) as Record<PropType, string>;
export const typeName = (t: PropType) => TYPE_NAME[t] ?? t;

const color = (i: number) => COLORS[i % COLORS.length].cls;

export function newOption(col: ColumnSchema, value: string): SelectOption {
  const n = col.options?.length ?? 0;
  return { id: newId("o_"), value, color: color(n + 1), ...(col.type === "status" ? { group: "todo" as const } : {}) };
}

const findOption = (col: ColumnSchema, text: string) => col.options?.find((o) => fold(o.value) === fold(text));

/** Coluna nova a partir do pedido da IA. Status sem opções usa as padrão do app. */
export function columnFrom(input: { nome?: string; tipo?: string; opcoes?: string[] }, defaults: { status: SelectOption[] }): ColumnSchema | string {
  const name = String(input.nome ?? "").trim();
  const type = AI_TYPES[fold(String(input.tipo ?? "")).replace(/\s+/g, "_")];
  if (!name) return "coluna sem nome";
  if (!type) return `tipo "${input.tipo}" não existe. Use: ${Object.keys(AI_TYPES).join(", ")}`;
  const col: ColumnSchema = { id: newId("p_"), name, type };
  if (type === "status") col.options = defaults.status.map((o) => ({ ...o }));
  if (type === "select" || type === "multi_select") {
    col.options = [];
    for (const v of input.opcoes ?? []) if (String(v).trim() && !findOption(col, String(v))) col.options.push(newOption(col, String(v).trim()));
  }
  return col;
}

function person(text: string, members: Person[]) {
  const t = fold(text);
  const m = members.find((p) => fold(p.email) === t)
    ?? members.find((p) => fold(p.name) === t)
    ?? members.find((p) => p.name && nameMatch(p.name, text))
    ?? members.find((p) => p.name && fold(p.name).split(" ")[0] === t);
  return m ? { id: m.id, name: m.name || m.email } : { name: text.trim() };
}

function date(text: string): DateValue | null {
  const open = /(?:→|->|até)\s*(em aberto|aberto|\?)\s*$/i.exec(text);
  const range = (open ? text.slice(0, open.index) : text).replace(/\s+até\s+/i, " → ").trim();
  const d = parseDate(range);
  if (!d) return null;
  const v: DateValue = { start: d.start, ...(d.end ? { end: d.end } : {}), ...(d.time ? { time: true } : {}) };
  return open ? { ...v, end: null, openEnd: true } : v;
}

export type Stored = { value?: any; error?: string };

/**
 * Converte o texto para o valor de `col`. Opção nova de seleção entra em `col.options`,
 * então quem chama precisa gravar o esquema se ele mudar.
 */
export function toStored(col: ColumnSchema, raw: unknown, members: Person[]): Stored {
  const text = raw === null || raw === undefined ? "" : String(raw).trim();
  if (!text) return { value: null };
  switch (col.type) {
    case "text": case "url": case "email": case "phone":
      return { value: text };
    case "number": {
      const n = parseNumber(text);
      return n === null ? { error: `"${text}" não é número` } : { value: n };
    }
    case "checkbox": {
      const b = parseCheckbox(text) ?? (["feito", "ok", "marcado", "concluido"].includes(fold(text)) ? true : null);
      return b === null ? { error: `"${text}" não é sim ou não` } : { value: b };
    }
    case "select": case "status": {
      const found = findOption(col, text);
      if (found) return { value: found.id };
      if (col.type === "status") return { error: `status "${text}" não existe. Opções: ${(col.options ?? []).map((o) => o.value).join(", ")}` };
      const created = newOption(col, text);
      col.options = [...(col.options ?? []), created];
      return { value: created.id };
    }
    case "multi_select": {
      const ids = parseMulti(text.replace(/;/g, ",")).map((v) => {
        const found = findOption(col, v);
        if (found) return found.id;
        const created = newOption(col, v);
        col.options = [...(col.options ?? []), created];
        return created.id;
      });
      return { value: ids };
    }
    case "date": {
      const d = date(text);
      return d ? { value: d } : { error: `"${text}" não é data. Use AAAA-MM-DD, com " → " para intervalo` };
    }
    case "person":
      return { value: parseMulti(text.replace(/;/g, ",")).map((p) => person(p, members)) };
    default:
      return { error: `a coluna "${col.name}" (${typeName(col.type)}) é preenchida pelo app` };
  }
}

/** Valor guardado como texto, para a IA ler. */
export function showValue(col: ColumnSchema, v: any): string {
  if (v === null || v === undefined || v === "") return "";
  const label = (id: string) => col.options?.find((o) => o.id === id)?.value ?? "";
  switch (col.type) {
    case "select": case "status": return label(v);
    case "multi_select": return (Array.isArray(v) ? v : []).map(label).filter(Boolean).join(", ");
    case "person": return (Array.isArray(v) ? v : []).map((p: any) => p?.name ?? "").filter(Boolean).join(", ");
    case "checkbox": return v ? "sim" : "não";
    case "date": {
      const d = v as DateValue;
      if (!d?.start) return "";
      return d.openEnd ? `${d.start} → em aberto` : d.end ? `${d.start} → ${d.end}` : d.start;
    }
    case "relation": return Array.isArray(v) && v.length ? `${v.length} item(ns) ligado(s)` : "";
    case "checklist": return Array.isArray(v) ? `${v.filter((i: any) => i?.done).length}/${v.length} feitos` : "";
    case "files": return (Array.isArray(v) ? v : []).map((f: any) => f?.name ?? "").join(", ");
    default: return typeof v === "object" ? "" : String(v);
  }
}

// ---------------------------------------------------------------- texto das páginas

const inline = (t: string) => {
  // **negrito** vira negrito; o resto entra como texto puro.
  const parts = t.split(/(\*\*[^*]+\*\*)/).filter(Boolean);
  return parts.map((p) => (/^\*\*[^*]+\*\*$/.test(p)
    ? { type: "text", text: p.slice(2, -2), styles: { bold: true } }
    : { type: "text", text: p, styles: {} }));
};

/** Texto simples com marcação leve (#, -, 1., [ ]) para blocos do editor. */
export function textToBlocks(text: string): any[] {
  const out: any[] = [];
  for (const raw of String(text ?? "").split(/\r?\n/).slice(0, 400)) {
    const line = raw.trimEnd();
    let m: RegExpExecArray | null;
    if (!line.trim()) { if (out.length && out[out.length - 1].content?.length) out.push({ type: "paragraph", content: [] }); continue; }
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) out.push({ type: "heading", props: { level: m[1].length }, content: inline(m[2]) });
    else if ((m = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line))) out.push({ type: "checkListItem", props: { checked: m[1] !== " " }, content: inline(m[2]) });
    else if ((m = /^\s*[-*•]\s+(.*)$/.exec(line))) out.push({ type: "bulletListItem", content: inline(m[1]) });
    else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) out.push({ type: "numberedListItem", content: inline(m[1]) });
    else out.push({ type: "paragraph", content: inline(line) });
  }
  while (out.length && !out[out.length - 1].content?.length) out.pop();
  return out;
}

const inlineText = (content: any): string =>
  Array.isArray(content) ? content.map((c) => (typeof c?.text === "string" ? c.text : inlineText(c?.content))).join("") : "";

/** Blocos do editor como texto, para a IA ler a página. */
export function blocksToText(blocks: any, max = 8000): string {
  const lines: string[] = [];
  const walk = (list: any[], depth: number) => {
    for (const b of list ?? []) {
      const t = inlineText(b?.content);
      const pad = "  ".repeat(depth);
      const prefix = b?.type === "heading" ? `${"#".repeat(b.props?.level ?? 1)} `
        : b?.type === "bulletListItem" ? "- "
        : b?.type === "numberedListItem" ? "1. "
        : b?.type === "checkListItem" ? (b.props?.checked ? "- [x] " : "- [ ] ")
        : "";
      if (b?.type === "table") lines.push(`${pad}[tabela]`);
      else if (t || prefix || b?.type === "paragraph") lines.push(pad + prefix + t);
      if (Array.isArray(b?.children)) walk(b.children, depth + 1);
    }
  };
  walk(Array.isArray(blocks) ? blocks : [], 0);
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return text.length > max ? `${text.slice(0, max)}\n… (texto cortado)` : text;
}
