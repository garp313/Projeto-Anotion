import { createClient } from "@/lib/supabase/client";
import type { ColumnSchema, DatabaseRow } from "@/components/database/types";
import { READ_ONLY } from "@/components/database/types";
import { displayText, rawValue, type Ctx } from "@/components/database/values";

export type PageHit = {
  kind: "page"; id: string; title: string; icon: string | null; parentTitle?: string;
  /** Textos pesquisáveis além do título: propriedades e conteúdo. */
  fields: { label: string; text: string }[];
};
export type EventHit = { kind: "event"; id: string; title: string; day: string; when: string; location?: string; description?: string };

/** Ignora maiúsculas e acentos: "logistica" encontra "Logística". */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function blockText(blocks: any[]): string {
  const out: string[] = [];
  const walk = (list: any[]) => {
    for (const b of list ?? []) {
      if (Array.isArray(b.content)) for (const c of b.content) if (c?.text) out.push(c.text);
      if (b.content?.rows) for (const r of b.content.rows) for (const cell of r.cells ?? []) walk([{ content: cell }]);
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return out.join(" ");
}

type Row = {
  id: string; parent_id: string | null; title: string; icon: string | null; is_database: boolean;
  content_json: any[] | null; database_schema: ColumnSchema[] | null; row_properties: Record<string, any> | null;
};

export async function loadPageIndex(): Promise<PageHit[]> {
  const { data, error } = await createClient()
    .from("pages")
    .select("id,parent_id,title,icon,is_database,content_json,database_schema,row_properties")
    .eq("is_archived", false);
  if (error) throw error;
  const rows = data as Row[];
  const byId = new Map(rows.map((r) => [r.id, r]));

  return rows.map((r) => {
    const parent = r.parent_id ? byId.get(r.parent_id) : undefined;
    const fields: PageHit["fields"] = [];
    if (parent?.is_database && parent.database_schema) {
      const ctx: Ctx = { schema: parent.database_schema, related: {}, userLabel: () => "" };
      for (const col of parent.database_schema) {
        if (col.type === "title" || col.type === "relation" || READ_ONLY.includes(col.type)) continue;
        const text = displayText(col, rawValue(col, r as unknown as DatabaseRow, ctx), ctx);
        if (text) fields.push({ label: col.name, text });
      }
    }
    const content = blockText(r.content_json ?? []);
    if (content) fields.push({ label: "Conteúdo", text: content });
    return { kind: "page", id: r.id, title: r.title, icon: r.icon, parentTitle: parent?.title, fields };
  });
}

/** Sem agenda conectada a busca segue só com páginas, sem erro. */
export async function loadEventIndex(): Promise<EventHit[]> {
  const now = Date.now(), day = 86_400_000;
  const qs = new URLSearchParams({
    timeMin: new Date(now - 90 * day).toISOString(),
    timeMax: new Date(now + 180 * day).toISOString(),
  });
  const res = await fetch(`/api/calendar/events?${qs}`);
  if (!res.ok) return [];
  const { events } = await res.json();
  return (events as any[]).map((e) => {
    const start = new Date(e.start.dateTime ?? `${e.start.date}T12:00:00`);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      kind: "event", id: `${e.calendarId}:${e.id}`, title: e.summary || "(Sem título)", location: e.location, description: e.description,
      day: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
      when: start.toLocaleString("pt-BR", e.start.dateTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }),
    };
  });
}

/** Trecho em volta do termo encontrado, para mostrar por que o item apareceu. */
export function snippet(text: string, q: string) {
  const i = fold(text).indexOf(q);
  if (i < 0) return text.slice(0, 80);
  const start = Math.max(0, i - 30);
  return `${start ? "…" : ""}${text.slice(start, i + q.length + 50)}`;
}
