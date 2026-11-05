"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchPage, type PageFull } from "@/lib/hooks/usePageTree";
import type { ColumnSchema, DatabaseRow, DatabaseViewConfig } from "./types";
import { DEFAULT_SCHEMA, defaultView, newId } from "./types";
import type { Ctx, RelatedDb } from "./values";
import { addMirror, detachMirror, mirrorIsValid, removeMirror, repairRelations, rollupsOf } from "./relations";
import { spawnNextOccurrence } from "@/lib/tasks";
import { memberName, scheduleEmails, useMembers, type Member } from "@/lib/collab";
import { setRowProp } from "@/lib/rowProps";
import { toast } from "@/lib/toast";

const BASE_COLS = "id,workspace_id,parent_id,title,icon,cover,position,is_database,row_properties,created_at,updated_at";
const FULL_COLS = `${BASE_COLS},created_by,last_edited_by,seq`;

/** Busca só o necessário: o content_json de cada linha nunca é lido na tabela. */
let hasAuthorColumns = true; // falso até a migration 0002 ser aplicada: evita repetir a consulta que falha

async function fetchRows(databaseId: string): Promise<DatabaseRow[]> {
  const supabase = createClient();
  const run = (cols: string) =>
    supabase.from("pages").select(cols).eq("parent_id", databaseId).eq("is_archived", false).order("position");
  let res = await run(hasAuthorColumns ? FULL_COLS : BASE_COLS);
  if (res.error?.code === "42703") { hasAuthorColumns = false; res = await run(BASE_COLS); }
  if (res.error) throw res.error;
  return (res.data ?? []) as unknown as DatabaseRow[];
}

// Referência estável: um [] novo a cada render invalidaria o contexto e recalcularia a tabela.
const NO_MEMBERS: Member[] = [];

type NewRow = { title?: string; icon?: string | null; content_json?: any[]; row_properties?: Record<string, any> };
export type RowTemplate = NewRow & { id: string; name: string };

const pushToCalendar = (pageId: string) =>
  fetch("/api/sync/task-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId }) })
    .catch(() => { /* a próxima alteração tenta de novo */ });

export const schemaOf = (page?: Pick<PageFull, "database_schema"> | null): ColumnSchema[] =>
  page?.database_schema?.length ? page.database_schema : DEFAULT_SCHEMA;

export function useDatabase(databaseId: string) {
  const supabase = useRef(createClient()).current;
  const qc = useQueryClient();
  const rowsKey = useMemo(() => ["database_rows", databaseId], [databaseId]);
  const pageKey = useMemo(() => ["page", databaseId], [databaseId]);
  const [me, setMe] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (u) setMe({ id: u.id, label: u.user_metadata?.full_name || u.email || "Você" });
    });
  }, [supabase]);

  const members = useMembers().data ?? NO_MEMBERS;
  // O time edita ao mesmo tempo: atualiza sozinho enquanto a aba está visível.
  const page = useQuery({ queryKey: pageKey, queryFn: () => fetchPage(databaseId), staleTime: Infinity, refetchInterval: 30_000 });
  const rowsQuery = useQuery({ queryKey: rowsKey, queryFn: () => fetchRows(databaseId), refetchInterval: 20_000, refetchOnWindowFocus: true });

  const schema = useMemo(() => schemaOf(page.data), [page.data]);
  const fallbackView = useRef<DatabaseViewConfig | null>(null);
  const views = useMemo<DatabaseViewConfig[]>(() => {
    const saved = page.data?.row_properties?.__views;
    if (saved?.length) return saved;
    fallbackView.current ??= defaultView("table", schema);
    return [fallbackView.current];
  }, [page.data, schema]);

  // Bancos ligados por propriedades de relação (para exibir nomes e calcular rollups).
  const relatedIds = useMemo(
    () => [...new Set(schema.filter((c) => c.type === "relation" && c.relationDatabaseId).map((c) => c.relationDatabaseId!))],
    [schema]
  );
  const relatedPages = useQueries({
    queries: relatedIds.map((id) => ({ queryKey: ["page", id], queryFn: () => fetchPage(id), staleTime: Infinity })),
  });
  const relatedRows = useQueries({
    queries: relatedIds.map((id) => ({ queryKey: ["database_rows", id], queryFn: () => fetchRows(id) })),
  });
  const relatedStamp = [...relatedPages, ...relatedRows].map((q) => q.dataUpdatedAt).join();
  const related = useMemo(() => {
    const out: Record<string, RelatedDb> = {};
    relatedIds.forEach((id, i) => {
      out[id] = { schema: schemaOf(relatedPages[i]?.data), rows: relatedRows[i]?.data ?? [] };
    });
    return out;
  }, [relatedIds, relatedStamp]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx: Ctx = useMemo(
    () => ({
      schema,
      related,
      userLabel: (id) => {
        if (!id) return "";
        if (id === me?.id) return me.label;
        const m = members.find((x) => x.id === id);
        return m ? memberName(m) : "Outro usuário";
      },
      me,
    }),
    [schema, related, me, members]
  );

  // Recupera bancos cuja relação foi quebrada antes da proteção existir.
  const loaded = Boolean(page.data);
  useEffect(() => {
    if (loaded) repairRelations(qc, databaseId).catch(() => { /* tenta de novo na próxima sessão */ });
  }, [loaded, qc, databaseId]);

  const patchPage = useCallback(
    async (patch: Partial<PageFull>) => {
      qc.setQueryData<PageFull>(pageKey, (old) => (old ? { ...old, ...patch } : old));
      // o banco pode ser linha de outro banco: mantém aquela cópia em dia
      qc.setQueriesData<DatabaseRow[]>({ queryKey: ["database_rows"] }, (old) => old?.map((r) => (r.id === databaseId ? { ...r, ...patch } as DatabaseRow : r)));
      const { error } = await supabase.from("pages").update(patch).eq("id", databaseId);
      if (error) throw error;
    },
    [qc, pageKey, supabase, databaseId]
  );
  /** Ajuste do próprio banco (visões, modelos), sem regravar o que outra pessoa acabou de mudar. */
  const patchProp = useCallback(
    async (key: string, value: unknown) => {
      const props = { ...qc.getQueryData<PageFull>(pageKey)?.row_properties, [key]: value };
      qc.setQueryData<PageFull>(pageKey, (old) => (old ? { ...old, row_properties: props } : old));
      await setRowProp(supabase, databaseId, key, value, props);
    },
    [qc, pageKey, supabase, databaseId]
  );

  const saveSchema = useCallback((next: ColumnSchema[]) => patchPage({ database_schema: next }), [patchPage]);
  const saveColumn = useCallback(
    (col: ColumnSchema) => saveSchema(schema.map((c) => (c.id === col.id ? col : c))),
    [saveSchema, schema]
  );
  const setViews = useCallback(
    (next: DatabaseViewConfig[]) => patchProp("__views", next),
    [patchProp]
  );
  const saveView = useCallback(
    (v: DatabaseViewConfig) => setViews(views.map((x) => (x.id === v.id ? v : x))),
    [setViews, views]
  );

  const setRows = useCallback(
    (fn: (rows: DatabaseRow[]) => DatabaseRow[]) => qc.setQueryData<DatabaseRow[]>(rowsKey, (old) => fn(old ?? [])),
    [qc, rowsKey]
  );

  const addRow = useMutation({
    mutationFn: async (init: NewRow = {}) => {
      const workspace_id = page.data?.workspace_id;
      if (!workspace_id) throw new Error("Banco de dados não carregado");
      const { data, error } = await supabase
        .from("pages")
        .insert({
          workspace_id, parent_id: databaseId, title: init.title ?? "", position: Date.now(), row_properties: init.row_properties ?? {},
          ...(init.icon ? { icon: init.icon } : {}), ...(init.content_json ? { content_json: init.content_json } : {}),
        })
        .select(BASE_COLS)
        .single();
      if (error) throw error;
      return data as unknown as DatabaseRow;
    },
    onSuccess: (row) => {
      setRows((r) => [...r, row]);
      qc.invalidateQueries({ queryKey: rowsKey }); // traz seq e autoria gerados pelo banco
    },
  });

  const setValue = useMutation({
    mutationFn: async ({ rowId, colId, value }: { rowId: string; colId: string; value: any }) => {
      const col = schema.find((c) => c.id === colId);
      if (col?.type === "title") {
        const { data, error } = await supabase.from("pages").update({ title: value }).eq("id", rowId).select("id");
        if (error) throw error;
        if (data && !data.length) throw Object.assign(new Error("sem permissão"), { code: "42501" });
        return;
      }
      // Só esta propriedade: gravar a linha inteira desfazia o que um colega acabou de mudar.
      const row = qc.getQueryData<DatabaseRow[]>(rowsKey)?.find((r) => r.id === rowId);
      await setRowProp(supabase, rowId, colId, value, row?.row_properties ?? { [colId]: value });
    },
    onMutate: async ({ rowId, colId, value }) => {
      await qc.cancelQueries({ queryKey: rowsKey });
      const prev = qc.getQueryData<DatabaseRow[]>(rowsKey);
      const isTitle = schema.find((c) => c.id === colId)?.type === "title";
      setRows((rows) =>
        rows.map((r) =>
          r.id !== rowId ? r : isTitle ? { ...r, title: value } : { ...r, row_properties: { ...r.row_properties, [colId]: value } }
        )
      );
      if (isTitle) {
        qc.setQueryData<PageFull>(["page", rowId], (old) => (old ? { ...old, title: value } : old));
        qc.setQueryData<any[]>(["pages"], (old) => old?.map((p) => (p.id === rowId ? { ...p, title: value } : p)));
      }
      return { prev };
    },
    onError: (_e, _v, c) => { if (c?.prev) qc.setQueryData(rowsKey, c.prev); },
    onSuccess: async (_d, { rowId, colId, value }, c) => {
      const col = schema.find((x) => x.id === colId);
      const synced = page.data?.row_properties?.__calendarSync;
      if (synced && (colId === synced || col?.type === "title")) pushToCalendar(rowId);
      if (col?.type === "person" || col?.type === "status") scheduleEmails();
      if (col?.type === "status") {
        const group = (id: any) => col.options?.find((o) => o.id === id)?.group;
        const before = c?.prev?.find((r) => r.id === rowId);
        const row = qc.getQueryData<DatabaseRow[]>(rowsKey)?.find((r) => r.id === rowId);
        if (row && group(value) === "complete" && group(before?.row_properties?.[colId]) !== "complete"
          && await spawnNextOccurrence(row, schema)) qc.invalidateQueries({ queryKey: rowsKey });
        return;
      }
      if (col?.type !== "relation" || !col.relationSyncProp || !col.relationDatabaseId) return;
      // Se o outro lado deixou de ser relação, gravar ali apagaria o valor daquela coluna.
      if (!(await mirrorIsValid(col.relationDatabaseId, col.relationSyncProp))) return;
      // Espelha no banco de destino só as linhas que entraram ou saíram da relação.
      const before: string[] = c?.prev?.find((r) => r.id === rowId)?.row_properties?.[colId] ?? [];
      const after: string[] = value ?? [];
      const changed = [...after.filter((id) => !before.includes(id)), ...before.filter((id) => !after.includes(id))];
      if (!changed.length) return;
      const { data } = await supabase.from("pages").select("id,row_properties").in("id", changed);
      await Promise.all((data ?? []).map((t) => {
        const cur: string[] = t.row_properties?.[col.relationSyncProp!] ?? [];
        const next = after.includes(t.id) ? [...new Set([...cur, rowId])] : cur.filter((id) => id !== rowId);
        return setRowProp(supabase, t.id, col.relationSyncProp!, next, { ...t.row_properties, [col.relationSyncProp!]: next });
      }));
      qc.invalidateQueries({ queryKey: ["database_rows", col.relationDatabaseId] });
    },
  });

  const removeRows = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.from("pages").update({ is_archived: true }).in("id", ids).select("id");
      if (error) throw error;
      if (data && !data.length) throw Object.assign(new Error("sem permissão"), { code: "42501" });
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: rowsKey });
      const prev = qc.getQueryData<DatabaseRow[]>(rowsKey);
      setRows((rows) => rows.filter((r) => !ids.includes(r.id)));
      return { prev };
    },
    onError: (_e, _v, c) => { if (c?.prev) qc.setQueryData(rowsKey, c.prev); },
    onSuccess: (_d, ids) => {
      qc.invalidateQueries({ queryKey: ["pages"] });
      toast({
        message: ids.length > 1 ? `${ids.length} itens foram para a lixeira.` : "Item foi para a lixeira.",
        action: {
          label: "Desfazer",
          run: async () => {
            await supabase.from("pages").update({ is_archived: false }).in("id", ids);
            qc.invalidateQueries({ queryKey: rowsKey });
            qc.invalidateQueries({ queryKey: ["pages"] });
          },
        },
      });
    },
  });

  const moveRow = useMutation({
    mutationFn: async ({ rowId, position }: { rowId: string; position: number }) => {
      const { error } = await supabase.from("pages").update({ position }).eq("id", rowId);
      if (error) throw error;
    },
    onMutate: async ({ rowId, position }) => {
      await qc.cancelQueries({ queryKey: rowsKey });
      const prev = qc.getQueryData<DatabaseRow[]>(rowsKey);
      setRows((rows) => rows.map((r) => (r.id === rowId ? { ...r, position } : r)).sort((a, b) => a.position - b.position));
      return { prev };
    },
    onError: (_e, _v, c) => { if (c?.prev) qc.setQueryData(rowsKey, c.prev); },
  });

  const duplicateRow = (row: DatabaseRow) =>
    addRow.mutate({ title: row.title ? `${row.title} (cópia)` : "", row_properties: row.row_properties });

  /** Aponta a relação para um banco e cria o espelho do outro lado, como o Notion faz. */
  const linkRelation = async (col: ColumnSchema, targetId?: string) => {
    const rollups = col.relationDatabaseId && col.relationSyncProp && col.relationDatabaseId !== databaseId
      ? await rollupsOf(col.relationDatabaseId, col.relationSyncProp) : [];
    if (col.relationDatabaseId && col.relationSyncProp) {
      if (col.relationDatabaseId === databaseId) {
        await saveSchema(schema.filter((c) => c.id !== col.relationSyncProp).map((c) => (c.id === col.id ? { ...c, relationDatabaseId: targetId, relationSyncProp: undefined } : c)));
      } else await removeMirror(qc, col.relationDatabaseId, col.relationSyncProp);
    }
    const next: ColumnSchema = { ...col, relationDatabaseId: targetId, relationSyncProp: undefined };
    if (!targetId) return saveColumn(next);
    const name = page.data?.title || "Relação";
    if (targetId === databaseId) {
      const mirror: ColumnSchema = { id: newId("p_"), name: `${col.name} (inverso)`, type: "relation", relationDatabaseId: databaseId, relationSyncProp: col.id };
      return saveSchema([...schema.map((c) => (c.id === col.id ? { ...next, relationSyncProp: mirror.id } : c)), mirror]);
    }
    const saved = saveColumn({ ...next, relationSyncProp: await addMirror(qc, targetId, name, databaseId, col.id, rollups) });
    qc.invalidateQueries({ queryKey: ["database_rows", targetId] });
    return saved;
  };
  const unlinkMirror = async (col: ColumnSchema) => {
    if (col.relationDatabaseId && col.relationSyncProp) await removeMirror(qc, col.relationDatabaseId, col.relationSyncProp);
    return saveColumn({ ...col, relationSyncProp: undefined });
  };
  const removeColumn = async (col: ColumnSchema) => {
    if (col.type === "relation" && col.relationDatabaseId && col.relationSyncProp && col.relationDatabaseId !== databaseId) {
      await detachMirror(qc, col.relationDatabaseId, col.relationSyncProp);
    }
    return saveSchema(schema.filter((c) => c.id !== col.id).map((c) => (c.relationSyncProp === col.id ? { ...c, relationSyncProp: undefined } : c)));
  };
  /** Cria um par de relações no próprio banco, como "Bloqueado por" e "Bloqueia". */
  const addSelfRelation = (name: string, inverse: string) => {
    const a: ColumnSchema = { id: newId("p_"), name, type: "relation", relationDatabaseId: databaseId };
    const b: ColumnSchema = { id: newId("p_"), name: inverse, type: "relation", relationDatabaseId: databaseId, relationSyncProp: a.id };
    return saveSchema([...schema, { ...a, relationSyncProp: b.id }, b]);
  };
  /** Cria uma linha no banco relacionado e já devolve o id, para vincular em seguida. */
  const createRelated = async (targetId: string, title: string) => {
    const workspace_id = page.data?.workspace_id;
    const { data, error } = await supabase.from("pages")
      .insert({ workspace_id, parent_id: targetId, title, position: Date.now(), row_properties: {} }).select(BASE_COLS).single();
    if (error) throw error;
    qc.setQueryData<DatabaseRow[]>(["database_rows", targetId], (old) => [...(old ?? []), data as unknown as DatabaseRow]);
    qc.invalidateQueries({ queryKey: ["pages"] });
    return (data as unknown as DatabaseRow).id;
  };

  /** Liga a sincronização do prazo e envia as tarefas que já têm data. */
  const setCalendarSync = async (colId: string | null) => {
    await patchProp("__calendarSync", colId);
    if (!colId) return;
    for (const r of rowsQuery.data ?? []) if (r.row_properties?.[colId]) await pushToCalendar(r.id);
  };

  const templates: RowTemplate[] = page.data?.row_properties?.__templates ?? [];
  const setTemplates = (next: RowTemplate[]) => patchProp("__templates", next);
  /** Guarda propriedades e conteúdo da linha para criar outras iguais pelo botão Novo. */
  const saveTemplate = async (row: DatabaseRow) => {
    const { data } = await supabase.from("pages").select("content_json").eq("id", row.id).single();
    const { title, icon, row_properties } = row;
    await setTemplates([...templates, { id: newId("t_"), name: title || "Modelo sem nome", title, icon, row_properties, content_json: data?.content_json ?? [] }]);
  };

  const addColumn = (col: Omit<ColumnSchema, "id">) => {
    const created = { ...col, id: newId("p_") };
    void saveSchema([...schema, created]);
    return created;
  };

  return {
    id: databaseId, page: page.data, schema, views, ctx, me, members,
    rows: rowsQuery.data ?? [],
    isLoading: rowsQuery.isLoading || page.isLoading,
    error: rowsQuery.error ?? page.error,
    saveSchema, saveColumn, addColumn, removeColumn, linkRelation, unlinkMirror, addSelfRelation, createRelated, setViews, saveView,
    templates, setTemplates, saveTemplate, setCalendarSync,
    addRow: (init?: NewRow) => addRow.mutateAsync(init ?? {}),
    setValue: (rowId: string, colId: string, value: any) => setValue.mutate({ rowId, colId, value }),
    removeRow: (rowId: string) => removeRows.mutate([rowId]),
    removeRows: (ids: string[]) => removeRows.mutate(ids),
    moveRow: (rowId: string, position: number) => moveRow.mutate({ rowId, position }),
    duplicateRow,
  };
}

export type Db = ReturnType<typeof useDatabase>;
