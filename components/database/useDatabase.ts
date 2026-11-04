"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchPage, type PageFull } from "@/lib/hooks/usePageTree";
import type { ColumnSchema, DatabaseRow, DatabaseViewConfig } from "./types";
import { DEFAULT_SCHEMA, defaultView, newId } from "./types";
import type { Ctx, RelatedDb } from "./values";

const BASE_COLS = "id,workspace_id,parent_id,title,icon,cover,position,is_database,row_properties,created_at,updated_at";
const FULL_COLS = `${BASE_COLS},created_by,last_edited_by,seq`;

/** Busca só o necessário: o content_json de cada linha nunca é lido na tabela. */
async function fetchRows(databaseId: string): Promise<DatabaseRow[]> {
  const supabase = createClient();
  const run = (cols: string) =>
    supabase.from("pages").select(cols).eq("parent_id", databaseId).eq("is_archived", false).order("position");
  let res = await run(FULL_COLS);
  if (res.error?.code === "42703") res = await run(BASE_COLS); // migration 0002 ainda não aplicada
  if (res.error) throw res.error;
  return (res.data ?? []) as unknown as DatabaseRow[];
}

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

  const page = useQuery({ queryKey: pageKey, queryFn: () => fetchPage(databaseId), staleTime: Infinity });
  const rowsQuery = useQuery({ queryKey: rowsKey, queryFn: () => fetchRows(databaseId) });

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
      userLabel: (id) => (!id ? "" : id === me?.id ? me.label : "Outro usuário"),
    }),
    [schema, related, me]
  );

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

  const saveSchema = useCallback((next: ColumnSchema[]) => patchPage({ database_schema: next }), [patchPage]);
  const saveColumn = useCallback(
    (col: ColumnSchema) => saveSchema(schema.map((c) => (c.id === col.id ? col : c))),
    [saveSchema, schema]
  );
  const setViews = useCallback(
    (next: DatabaseViewConfig[]) => {
      const props = qc.getQueryData<PageFull>(pageKey)?.row_properties;
      return patchPage({ row_properties: { ...props, __views: next } });
    },
    [patchPage, qc, pageKey]
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
    mutationFn: async (init: { title?: string; row_properties?: Record<string, any> } = {}) => {
      const workspace_id = page.data?.workspace_id;
      if (!workspace_id) throw new Error("Banco de dados não carregado");
      const { data, error } = await supabase
        .from("pages")
        .insert({ workspace_id, parent_id: databaseId, title: init.title ?? "", position: Date.now(), row_properties: init.row_properties ?? {} })
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
        const { error } = await supabase.from("pages").update({ title: value }).eq("id", rowId);
        if (error) throw error;
        return;
      }
      // onMutate já aplicou a mudança: o cache tem o estado mais novo de todas as células.
      const row = qc.getQueryData<DatabaseRow[]>(rowsKey)?.find((r) => r.id === rowId);
      const { error } = await supabase.from("pages").update({ row_properties: row?.row_properties ?? { [colId]: value } }).eq("id", rowId);
      if (error) throw error;
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
      if (col?.type !== "relation" || !col.relationSyncProp || !col.relationDatabaseId) return;
      // Espelha no banco de destino só as linhas que entraram ou saíram da relação.
      const before: string[] = c?.prev?.find((r) => r.id === rowId)?.row_properties?.[colId] ?? [];
      const after: string[] = value ?? [];
      const changed = [...after.filter((id) => !before.includes(id)), ...before.filter((id) => !after.includes(id))];
      if (!changed.length) return;
      const { data } = await supabase.from("pages").select("id,row_properties").in("id", changed);
      await Promise.all((data ?? []).map((t) => {
        const cur: string[] = t.row_properties?.[col.relationSyncProp!] ?? [];
        const next = after.includes(t.id) ? [...new Set([...cur, rowId])] : cur.filter((id) => id !== rowId);
        return supabase.from("pages").update({ row_properties: { ...t.row_properties, [col.relationSyncProp!]: next } }).eq("id", t.id);
      }));
      qc.invalidateQueries({ queryKey: ["database_rows", col.relationDatabaseId] });
    },
  });

  const removeRow = useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.from("pages").update({ is_archived: true }).eq("id", rowId);
      if (error) throw error;
    },
    onMutate: async (rowId) => {
      await qc.cancelQueries({ queryKey: rowsKey });
      const prev = qc.getQueryData<DatabaseRow[]>(rowsKey);
      setRows((rows) => rows.filter((r) => r.id !== rowId));
      return { prev };
    },
    onError: (_e, _v, c) => { if (c?.prev) qc.setQueryData(rowsKey, c.prev); },
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

  const addColumn = (col: Omit<ColumnSchema, "id">) => {
    const created = { ...col, id: newId("p_") };
    void saveSchema([...schema, created]);
    return created;
  };

  return {
    id: databaseId, page: page.data, schema, views, ctx, me,
    rows: rowsQuery.data ?? [],
    isLoading: rowsQuery.isLoading || page.isLoading,
    error: rowsQuery.error ?? page.error,
    saveSchema, saveColumn, addColumn, setViews, saveView,
    addRow: (init?: { title?: string; row_properties?: Record<string, any> }) => addRow.mutateAsync(init ?? {}),
    setValue: (rowId: string, colId: string, value: any) => setValue.mutate({ rowId, colId, value }),
    removeRow: (rowId: string) => removeRow.mutate(rowId),
    moveRow: (rowId: string, position: number) => moveRow.mutate({ rowId, position }),
    duplicateRow,
  };
}

export type Db = ReturnType<typeof useDatabase>;
