"use client";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/client";
import type { ColumnSchema, DatabaseRow } from "@/components/database/types";
import { DEFAULT_SCHEMA } from "@/components/database/types";
import { toCsv } from "@/components/database/csv";
import { displayText, rawValue, type Ctx } from "@/components/database/values";

type Page = {
  id: string; parent_id: string | null; title: string; icon: string | null; is_database: boolean; position: number;
  content_json: any[] | null; database_schema: ColumnSchema[] | null; row_properties: Record<string, any> | null;
  created_at?: string; updated_at?: string;
};

const hex = (id: string) => id.replace(/-/g, "");
const safe = (s: string) => (s || "Sem título").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
const entry = (p: Page) => `${safe(p.title)} ${hex(p.id)}`;

/** Texto dos blocos em Markdown simples, sem depender do editor estar montado. */
function inline(content: any): string {
  if (!Array.isArray(content)) return "";
  return content.map((c) => {
    if (c.type === "mention") return c.props?.kind === "person" ? `@${c.props.label}` : c.props?.label ?? "";
    if (c.type === "link") return `[${inline(c.content)}](${c.href})`;
    const text = c.text ?? "";
    return c.styles?.bold ? `**${text}**` : c.styles?.italic ? `*${text}*` : c.styles?.code ? `\`${text}\`` : text;
  }).join("");
}

function toMarkdown(blocks: any[], indent = ""): string {
  return (blocks ?? []).map((b) => {
    const text = inline(b.content);
    const line = (() => {
      switch (b.type) {
        case "heading": return `${"#".repeat(Math.min(b.props?.level ?? 1, 6))} ${text}`;
        case "bulletListItem": return `- ${text}`;
        case "numberedListItem": return `1. ${text}`;
        case "checkListItem": return `- [${b.props?.checked ? "x" : " "}] ${text}`;
        case "quote": return `> ${text}`;
        case "codeBlock": return `\`\`\`\n${text}\n\`\`\``;
        case "image": return `![${b.props?.caption ?? ""}](${b.props?.url ?? ""})`;
        case "divider": return "---";
        case "bookmark": case "embed": return b.props?.url ?? "";
        case "database": case "toc": return "";
        default: return text;
      }
    })();
    const kids = b.children?.length ? `\n${toMarkdown(b.children, `${indent}  `)}` : "";
    return `${indent}${line}${kids}`;
  }).filter((l) => l.trim()).join("\n\n");
}

function save(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safe(name)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Mesma estrutura do export do Notion: reimportar aqui reconhece as páginas pelo id. */
export async function exportZip(rootId: string) {
  const { data, error } = await createClient().from("pages")
    .select("id,parent_id,title,icon,is_database,position,content_json,database_schema,row_properties,created_at,updated_at").eq("is_archived", false);
  if (error) throw error;
  const all = data as Page[];
  const byId = new Map(all.map((p) => [p.id, p]));
  const children = (id: string) => all.filter((p) => p.parent_id === id).sort((a, b) => a.position - b.position);
  const root = byId.get(rootId);
  if (!root) throw new Error("Página não encontrada");
  const zip = new JSZip();

  const writeMd = (p: Page, dir: string, header: string[] = []) => {
    const title = `# ${p.icon ? `${p.icon} ` : ""}${p.title || "Sem título"}`;
    const body = toMarkdown(p.content_json ?? []);
    zip.file(`${dir}${entry(p)}.md`, [title, ...(header.length ? [header.join("\n")] : []), body].filter(Boolean).join("\n\n"));
  };

  const writeDb = (db: Page, dir: string) => {
    const schema = db.database_schema?.length ? db.database_schema : DEFAULT_SCHEMA;
    const rows = children(db.id);
    const ctx: Ctx = { schema, related: {}, userLabel: () => "" };
    const relation = (ids: string[]) => ids.map((id) => {
      const target = byId.get(id);
      return `${target?.title || "Sem título"} (https://www.notion.so/${hex(id)})`;
    }).join(", ");
    const csv = toCsv(rows as unknown as DatabaseRow[], schema.filter((c) => !["rollup", "formula"].includes(c.type)), ctx, { separator: ",", relation });
    zip.file(`${dir}${entry(db)}.csv`, csv);
    zip.file(`${dir}${entry(db)}_all.csv`, csv);
    for (const row of rows) {
      const header = schema
        .filter((c) => c.type !== "title")
        .map((c) => [c.name, displayText(c, rawValue(c, row as unknown as DatabaseRow, ctx), ctx)] as const)
        .filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
      writeMd(row, `${dir}${entry(db)}/`, header);
      writeChildren(row, `${dir}${entry(db)}/`);
    }
  };

  const writeChildren = (p: Page, dir: string) => {
    for (const child of children(p.id)) {
      if (child.is_database) writeDb(child, `${dir}${entry(p)}/`);
      else { writeMd(child, `${dir}${entry(p)}/`); writeChildren(child, `${dir}${entry(p)}/`); }
    }
  };

  if (root.is_database) writeDb(root, "");
  else { writeMd(root, ""); writeChildren(root, ""); }
  save(root.title, await zip.generateAsync({ type: "blob", compression: "DEFLATE" }));
}
