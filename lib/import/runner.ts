"use client";
import type { QueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ColumnSchema, DatabaseViewConfig } from "@/components/database/types";
import { DEFAULT_SCHEMA, defaultView, newId } from "@/components/database/types";
import { dropCsvLinks, type NotionDb, type NotionExport, type NotionPage } from "./notionZip";
import { NOTES, applyToSchema, convertRow, type DbPlan, type Issue, type Member } from "./mapping";
import { fold } from "./parsers";
import { markdownToBlocks, rewriteLinks } from "./markdown";

export type ImportMode = "add" | "update";
export type ImportReport = {
  importId: string; created: number; updated: number; skipped: number; issues: Issue[]; notes: string[]; cancelled: boolean; openId: string | null;
};
type Progress = (done: number, total: number, label: string) => void;

const BATCH = 50;
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", pdf: "application/pdf", svg: "image/svg+xml" };

const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
const depth = (p: string) => p.split("/").length;

function viewsFor(schema: ColumnSchema[]): DatabaseViewConfig[] {
  const status = schema.find((c) => c.type === "status");
  const date = schema.find((c) => c.type === "date");
  const views = [defaultView("table", schema)];
  if (status) views.push({ ...defaultView("board", schema), name: "Por status", groupBy: status.id });
  if (date) views.push({ ...defaultView("timeline", schema), name: "Linha do tempo", dateProp: date.id });
  return views;
}

export async function runImport(exp: NotionExport, plans: DbPlan[], opts: {
  workspaceId: string; userId: string; mode: ImportMode; members: Member[]; qc: QueryClient; parentId?: string | null;
  onProgress: Progress; cancelled: () => boolean;
}): Promise<ImportReport> {
  const supabase = createClient();
  const { workspaceId, mode, members, onProgress, cancelled } = opts;
  const { data: made, error } = await supabase.from("imports")
    .insert({ workspace_id: workspaceId, file_name: exp.file, mode, mapping: plans.map(({ db, ...p }) => ({ db: db.name, ...p })) })
    .select("id").single();
  if (error) throw error;
  const importId: string = made.id;

  const report: ImportReport = { importId, created: 0, updated: 0, skipped: 0, issues: [], notes: [], cancelled: false, openId: null };
  const send = async (rows: Record<string, unknown>[]) => {
    const { data, error: e } = await supabase.rpc("import_pages", { p_import: importId, p_workspace: workspaceId, p_mode: mode, p_rows: rows });
    if (e) throw e;
    for (const r of data as { action: string }[]) {
      if (r.action === "created") report.created++; else if (r.action === "updated") report.updated++; else report.skipped++;
    }
    return data as { external_id: string; page_id: string; action: string }[];
  };

  const rowPages = exp.pages.filter((p) => p.rowOf);
  const plain = exp.pages.filter((p) => !p.rowOf).sort((a, b) => depth(a.path) - depth(b.path));
  const total = plain.length + plans.reduce((n, p) => n + p.db.rows.length, 0) + exp.pages.length;
  let done = 0;
  const step = (n: number, label: string) => { done += n; onProgress(done, total, label); };

  const pageIds = new Map<string, string>();     // caminho do .md -> id
  const extIds = new Map<string, string>();      // id do Notion -> id
  const titleIds = new Map<string, string>();    // título -> id, para relação sem link
  const touched = new Map<string, string>();     // caminho -> ação
  const inner = new Map<string, string[]>();     // caminho da página -> bancos dentro dela
  const remember = (extId: string, id: string, title: string, path?: string, action?: string) => {
    extIds.set(extId, id);
    if (title) titleIds.set(fold(title), id);
    if (path) { pageIds.set(path, id); if (action) touched.set(path, action); }
  };

  // 1. Páginas soltas, dos níveis de cima para baixo: cada uma precisa do id da mãe.
  for (const page of plain) {
    if (cancelled()) { report.cancelled = true; break; }
    const [r] = await send([{
      external_id: page.id, title: page.title, icon: page.icon, position: Date.now(),
      parent_id: (page.parent && pageIds.get(page.parent)) || opts.parentId || "",
    }]);
    remember(page.id, r.page_id, page.title, page.path, r.action);
    step(1, `Página ${page.title}`);
  }

  // 2. Bancos e linhas. Bancos de fora primeiro: as linhas deles são mães dos bancos internos.
  const relations: { rowId: string; relations: ReturnType<typeof convertRow>["relations"] }[] = [];
  const schemas = new Map<string, ColumnSchema[]>();
  for (const plan of [...plans].sort((a, b) => depth(a.db.path) - depth(b.db.path))) {
    if (report.cancelled || cancelled()) { report.cancelled = true; break; }
    const { db } = plan;
    let dbId: string;
    let base: ColumnSchema[];
    if (plan.target.kind === "existing") {
      const { data } = await supabase.from("pages").select("database_schema").eq("id", plan.target.id).single();
      base = data?.database_schema?.length ? data.database_schema : DEFAULT_SCHEMA;
      dbId = plan.target.id;
    } else {
      const title = plan.columns.find((c) => c.dest.kind === "title")?.source ?? "Nome";
      base = [{ id: "title", name: title, type: "title" }];
      dbId = "";
    }
    let { schema, ids } = applyToSchema(plan, base, newId);
    let rows = db.rows.map((r, i) => convertRow(plan, r, i, schema, ids));
    // Valor que não dá para ler fica guardado numa coluna, em vez de sumir.
    if (rows.some((r) => r.issues.length) && !schema.some((c) => c.name === NOTES)) {
      schema = [...schema, { id: newId("p_"), name: NOTES, type: "text" }];
      rows = db.rows.map((r, i) => convertRow(plan, r, i, schema, ids));
    }
    if (plan.target.kind === "new") {
      const [r] = await send([{
        external_id: db.id, title: plan.target.title, is_database: true, database_schema: schema, position: Date.now(),
        parent_id: (db.parent && pageIds.get(db.parent)) || opts.parentId || "", row_properties: { __views: viewsFor(schema) },
      }]);
      dbId = r.page_id;
      remember(db.id, dbId, plan.target.title);
      if (r.action !== "created") {
        // Reimportação: o banco já existe, e as colunas novas se somam às dele.
        const { data } = await supabase.from("pages").select("database_schema").eq("id", dbId).single();
        const merged = applyToSchema(plan, data?.database_schema ?? schema, newId);
        schema = merged.schema; ids = merged.ids;
        rows = db.rows.map((row, i) => convertRow(plan, row, i, schema, ids));
      }
    }
    if (schema !== base) {
      const { error: e } = await supabase.rpc("quiet_update", { p_page: dbId, p_patch: { database_schema: schema } });
      if (e) throw e;
    }
    schemas.set(dbId, schema);
    if (db.parent && plan.target.kind === "new") inner.set(db.parent, [...(inner.get(db.parent) ?? []), dbId]);

    // Demandas de um projeto: entram direto no banco de destino, já ligadas a ele.
    const projectId = plan.sendToTasks && db.parent ? pageIds.get(db.parent) : undefined;
    let mirror: string | undefined;
    if (projectId) {
      const { data: project } = await supabase.from("pages").select("parent_id").eq("id", projectId).single();
      const link = schema.find((c) => c.type === "relation" && c.relationDatabaseId === project?.parent_id);
      if (link) {
        rows.forEach((r) => { r.props[link.id] = [projectId]; });
        mirror = link.relationSyncProp;
      } else report.notes.push(`"${db.name}": o projeto não está num banco relacionado ao destino, então as linhas entraram sem vínculo.`);
    }
    report.issues.push(...rows.flatMap((r) => r.issues));
    opts.qc.setQueryData<any>(["page", dbId], (old: any) => (old ? { ...old, database_schema: schema } : old));

    // Sem id por linha no CSV: o nome identifica, com um número para repetidos.
    const seen = new Map<string, number>();
    const usedMd = new Set<string>();
    const pending = rows.map((row, i) => {
      const key = fold(row.title);
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      // Linha sem nome vira "Sem título" no arquivo; nomes repetidos usam cada arquivo uma vez só.
      const mdTitle = key || fold("Sem título");
      const md = rowPages.find((p) => p.rowOf === db.id && fold(p.title) === mdTitle && !usedMd.has(p.path));
      if (md) usedMd.add(md.path);
      return { row, md, position: Date.now() + i, ext: md?.id ?? `${db.id}:${key}#${n}` };
    });
    for (const batch of chunks(pending, BATCH)) {
      if (cancelled()) { report.cancelled = true; break; }
      const result = await send(batch.map((p) => ({
        external_id: p.ext, title: p.row.title, parent_id: dbId, position: p.position, row_properties: p.row.props,
        ...(p.md?.icon ? { icon: p.md.icon } : {}),
      })));
      result.forEach((r, i) => {
        const p = batch[i];
        remember(p.ext, r.page_id, p.row.title, p.md?.path, r.action);
        if (p.row.relations.length) relations.push({ rowId: r.page_id, relations: p.row.relations });
      });
      step(batch.length, db.name);
    }
    if (projectId && mirror) {
      const key = mirror;
      await supabase.rpc("import_snapshot", { p_import: importId, p_page: projectId });
      const { data: project } = await supabase.from("pages").select("row_properties").eq("id", projectId).single();
      const ids = pending.map((p) => extIds.get(p.ext)).filter(Boolean);
      const next = { ...project?.row_properties, [key]: [...new Set([...(project?.row_properties?.[key] ?? []), ...ids])] };
      const { error: e } = await supabase.rpc("quiet_update", { p_page: projectId, p_patch: { row_properties: next } });
      if (e) throw e;
    }
  }

  // Subpágina de uma linha nasce antes da linha: agora a mãe já existe.
  for (const page of plain) {
    const parent = page.parent && pageIds.get(page.parent);
    const id = pageIds.get(page.path);
    if (parent && id && touched.get(page.path) === "created") {
      await supabase.rpc("quiet_update", { p_page: id, p_patch: { parent_id: parent } });
    }
  }

  // 3. Relações: só agora todas as páginas do lote existem.
  const unresolved = new Set<string>();
  for (const item of relations) {
    for (const rel of item.relations) {
      const ids = rel.items.map((r) => (r.id && extIds.get(r.id)) || (r.id && /^[0-9a-f]{32}$/.test(r.id) ? null : null) || titleIds.get(fold(r.title)));
      rel.items.forEach((r, i) => { if (!ids[i]) unresolved.add(r.title); });
      const found = ids.filter(Boolean);
      if (!found.length) continue;
      await supabase.rpc("set_row_prop", { p_page: item.rowId, p_key: rel.colId, p_value: found });
      // Coluna criada agora: o destino só se descobre pelas páginas que ela aponta.
      for (const [id, list] of schemas) {
        const col = list.find((c) => c.id === rel.colId);
        if (!col || col.relationDatabaseId) continue;
        const { data: target } = await supabase.from("pages").select("parent_id").eq("id", found[0]!).single();
        if (!target?.parent_id) continue;
        col.relationDatabaseId = target.parent_id;
        await supabase.rpc("quiet_update", { p_page: id, p_patch: { database_schema: list } });
      }
    }
  }
  if (unresolved.size) report.notes.push(`${unresolved.size} relação(ões) apontam para páginas fora do export e ficaram vazias.`);

  // 4. Conteúdo das páginas.
  const uploads = new Map<string, string | null>();
  const upload = async (path: string) => {
    if (uploads.has(path)) return uploads.get(path)!;
    const data = exp.assets.get(path);
    if (!data) { uploads.set(path, null); return null; }
    const ext = path.split(".").pop()?.toLowerCase() ?? "bin";
    const target = `${opts.userId}/${crypto.randomUUID()}.${ext}`;
    const { error: e } = await supabase.storage.from("page-media").upload(target, data, { contentType: MIME[ext] ?? "application/octet-stream" });
    const url = e ? null : supabase.storage.from("page-media").getPublicUrl(target).data.publicUrl;
    if (!url) report.notes.push(`Não foi possível enviar o anexo ${path.split("/").pop()}.`);
    uploads.set(path, url);
    return url;
  };
  const resolvePage = (target: string) => {
    const id = /([0-9a-f]{32})\.md$/i.exec(target)?.[1]?.toLowerCase();
    return id ? extIds.get(id) : undefined;
  };
  for (const page of exp.pages as NotionPage[]) {
    if (report.cancelled || cancelled()) { report.cancelled = true; break; }
    const id = pageIds.get(page.path);
    const action = touched.get(page.path);
    step(1, `Conteúdo de ${page.title}`);
    if (!id || action === "skipped") continue;
    const dir = page.path.split("/").slice(0, -1).join("/");
    const body = await rewriteLinks(dropCsvLinks(page.body), dir, resolvePage, upload);
    const blocks = await markdownToBlocks(body, members);
    const databases = (inner.get(page.path) ?? []).map((databaseId) => ({ type: "database", props: { databaseId } }));
    if (!blocks.length && !databases.length) continue;
    const { error: e } = await supabase.rpc("quiet_update", { p_page: id, p_patch: { content_json: [...blocks, ...databases] } });
    if (e) throw e;
  }

  report.openId = plans.length === 1 && plans[0].target.kind === "new" ? extIds.get(plans[0].db.id) ?? null : null;
  await supabase.from("imports").update({
    report: { created: report.created, updated: report.updated, skipped: report.skipped, issues: report.issues.length, notes: report.notes },
  }).eq("id", importId);
  for (const key of [["pages"], ["database_rows"], ["tasks"], ["search-index"]]) opts.qc.invalidateQueries({ queryKey: key });
  return report;
}

export async function undoImport(importId: string, qc: QueryClient) {
  const { error } = await createClient().rpc("undo_import", { p_import: importId });
  if (error) throw error;
  for (const key of [["pages"], ["database_rows"], ["tasks"], ["search-index"], ["trash"]]) qc.invalidateQueries({ queryKey: key });
}

export type { NotionDb };
