import type { ColumnSchema, DatabaseRow } from "./types";
import { asDate, displayText, rawValue, type Ctx } from "./values";

const toBr = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

/** Ponto e vírgula é o que o Excel em português abre direto em colunas. */
const SEP = ";";
const quote = (s: string) => (/[";,\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function toCsv(rows: DatabaseRow[], cols: ColumnSchema[], ctx: Ctx, opts: { separator?: string; relation?: (ids: string[]) => string } = {}) {
  const sep = opts.separator ?? SEP;
  const cell = (c: ColumnSchema, r: DatabaseRow) => {
    const v = rawValue(c, r, ctx);
    if (c.type === "relation" && opts.relation) return opts.relation(v);
    // Só o nome perderia o anexo ao reimportar.
    if (c.type === "files") return (v as { name: string; url?: string }[]).map((f) => f.url ?? f.name).join(", ");
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
