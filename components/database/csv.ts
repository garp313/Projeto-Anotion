import type { ColumnSchema, DatabaseRow, SelectOption } from "./types";
import { COLORS, READ_ONLY, newId } from "./types";
import { asDate, displayText, rawValue, type Ctx } from "./values";
import { parseBr, toBr } from "./DatePicker";

/** Ponto e vírgula é o que o Excel em português abre direto em colunas. */
const SEP = ";";
const quote = (s: string) => (/[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function toCsv(rows: DatabaseRow[], cols: ColumnSchema[], ctx: Ctx) {
  const cell = (c: ColumnSchema, r: DatabaseRow) => {
    const v = rawValue(c, r, ctx);
    if (c.type === "date") { const d = asDate(v); return d ? [toBr(d.start), toBr(d.end)].filter(Boolean).join(" → ") : ""; }
    return displayText(c, v, ctx);
  };
  const lines = [cols.map((c) => quote(c.name)), ...rows.map((r) => cols.map((c) => quote(cell(c, r))))];
  return `﻿${lines.map((l) => l.join(SEP)).join("\r\n")}`;
}

export function downloadCsv(name: string, csv: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${name.replace(/[\\/:*?"<>|]/g, "_") || "banco"}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const first = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cur = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const MONTHS = ["jan", "fev|feb", "mar", "abr|apr", "mai|may", "jun", "jul", "ago|aug", "set|sep", "out|oct", "nov", "dez|dec"];
const monthOf = (word: string) => MONTHS.findIndex((m) => new RegExp(`^(${m})`, "i").test(word)) + 1;

/** O Notion exporta "September 30, 2026"; também aceita dd/mm/aaaa, ISO e "30 de setembro de 2026". */
function parseDay(s: string) {
  const text = s.trim();
  const br = /^\d{1,2}\/\d{1,2}\/\d{4}/.exec(text);
  if (br) return parseBr(br[0]);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const en = /^([a-zç]+)\.? (\d{1,2}), (\d{4})/i.exec(text);
  const pt = /^(\d{1,2}) de ([a-zç]+)\.? de (\d{4})/i.exec(text);
  const [word, day, year] = en ? [en[1], en[2], en[3]] : pt ? [pt[2], pt[1], pt[3]] : [];
  return word && monthOf(word) ? parseBr(`${day}/${monthOf(word)}/${year}`) : null;
}

const SKIP = [...READ_ONLY, "relation", "files", "checklist"];

/** Liga as colunas do arquivo às do banco pelo nome; as desconhecidas viram propriedades de texto. */
export function planImport(table: string[][], schema: ColumnSchema[]) {
  const [header, ...body] = table;
  const next: ColumnSchema[] = schema.map((c) => (c.options ? { ...c, options: [...c.options] } : { ...c }));
  const titleCol = next.find((c) => c.type === "title")!;
  const cols = header.map((raw, i) => {
    const name = raw.trim();
    const found = next.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (found) return found;
    if (i === 0) return titleCol;
    const created: ColumnSchema = { id: newId("p_"), name: name || `Coluna ${i + 1}`, type: "text" };
    next.push(created);
    return created;
  });

  const option = (c: ColumnSchema, label: string) => {
    const hit = c.options?.find((o) => o.value.toLowerCase() === label.toLowerCase());
    if (hit) return hit.id;
    const o: SelectOption = {
      id: newId("o_"), value: label, color: COLORS[((c.options?.length ?? 0) + 1) % COLORS.length].cls,
      ...(c.type === "status" ? { group: "todo" as const } : {}),
    };
    c.options = [...(c.options ?? []), o];
    return o.id;
  };
  const convert = (c: ColumnSchema, raw: string): any => {
    switch (c.type) {
      case "select": case "status": return option(c, raw);
      case "multi_select": return raw.split(/,\s*/).filter(Boolean).map((v) => option(c, v));
      case "person": return raw.split(/,\s*/).filter(Boolean).map((name) => ({ name }));
      case "checkbox": return /^(sim|true|1|x)$/i.test(raw);
      case "number": { const n = Number(raw.replace(/[^\d,.-]/g, "").replace(/\.(?=.*,)/g, "").replace(",", ".")); return Number.isNaN(n) ? null : n; }
      case "date": {
        const [a, b] = raw.split(/\s*→\s*/);
        const start = parseDay(a);
        return start ? { start, end: b ? parseDay(b) : null } : null;
      }
      default: return raw;
    }
  };

  const rows = body.map((line) => {
    const row: { title: string; row_properties: Record<string, any> } = { title: "", row_properties: {} };
    cols.forEach((c, i) => {
      const raw = (line[i] ?? "").trim();
      if (!raw || SKIP.includes(c.type)) return;
      if (c.type === "title") row.title = raw;
      else row.row_properties[c.id] = convert(c, raw);
    });
    return row;
  });
  return { schema: next, rows };
}
