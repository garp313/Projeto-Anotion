"use client";
import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ColumnSchema, DatabaseRow } from "./types";

export function useDatabase(databaseId: string, initialSchema: ColumnSchema[] = []) {
  const supabase = useRef(createClient()).current;
  const qc = useQueryClient();
  
  // Refs para gerenciar o debounce de células (evita sobrecarga no banco)
  const cellUpdateTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const pendingCellUpdates = useRef<Record<string, { value: any }>>({});

  // Buscar linhas do banco (páginas filhas)
  const rowsQuery = useQuery({
    queryKey: ["database_rows", databaseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pages")
        .select("*")
        .eq("parent_id", databaseId)
        .eq("is_archived", false)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DatabaseRow[];
    },
  });

  // Adicionar nova linha
  const addRow = useMutation({
    mutationFn: async (initialValues: Partial<DatabaseRow> = {}) => {
      const { data: dbPage } = await supabase
        .from("pages")
        .select("workspace_id")
        .eq("id", databaseId)
        .single();

      if (!dbPage) throw new Error("Database não encontrada");

      const { data, error } = await supabase
        .from("pages")
        .insert({
          workspace_id: dbPage.workspace_id,
          parent_id: databaseId,
          title: initialValues.title ?? "",
          icon: initialValues.icon ?? null,
          position: Date.now(),
          is_database: false,
          row_properties: initialValues.row_properties ?? {},
          content_json: [],
        })
        .select("*")
        .single();

      if (error) throw error;
      return data as DatabaseRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["database_rows", databaseId] });
      qc.invalidateQueries({ queryKey: ["pages"] });
    },
  });

  // Atualizar célula de uma linha (Com Debounce nativo para texto/edição rápida)
  const updateCell = useMutation({
    mutationFn: async ({
      rowId,
      columnId,
      value,
    }: {
      rowId: string;
      columnId: string;
      value: any;
    }) => {
      return new Promise<void>((resolve, reject) => {
        const timerKey = `${rowId}-${columnId}`;
        
        // Limpa o timer anterior se existir
        if (cellUpdateTimers.current[timerKey]) {
          clearTimeout(cellUpdateTimers.current[timerKey]);
        }

        // Armazena o valor mais recente para não perdê-lo
        pendingCellUpdates.current[timerKey] = { value };

        // Aguarda 600ms após a última digitação/clique antes de mandar pro Supabase
        cellUpdateTimers.current[timerKey] = setTimeout(async () => {
          const finalValue = pendingCellUpdates.current[timerKey].value;
          delete pendingCellUpdates.current[timerKey];

          try {
            if (columnId === "title") {
              const { error } = await supabase
                .from("pages")
                .update({ title: finalValue })
                .eq("id", rowId);
              if (error) throw error;
            } else {
              const currentRow = rowsQuery.data?.find((r) => r.id === rowId);
              const currentProps = currentRow?.row_properties ?? {};
              const updatedProps = { ...currentProps, [columnId]: finalValue };

              const { error } = await supabase
                .from("pages")
                .update({ row_properties: updatedProps })
                .eq("id", rowId);
              if (error) throw error;
            }
            resolve();
          } catch (err) {
            reject(err);
          }
        }, 600);
      });
    },
    onMutate: async ({ rowId, columnId, value }) => {
      await qc.cancelQueries({ queryKey: ["database_rows", databaseId] });
      const prev = qc.getQueryData<DatabaseRow[]>(["database_rows", databaseId]);
      
      // UI Otimista: Atualiza a tela instantaneamente enquanto o debounce roda
      qc.setQueryData<DatabaseRow[]>(["database_rows", databaseId], (old) =>
        old?.map((r) => {
          if (r.id !== rowId) return r;
          if (columnId === "title") return { ...r, title: value };
          return { ...r, row_properties: { ...r.row_properties, [columnId]: value } };
        })
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["database_rows", databaseId], ctx.prev);
    },
    onSettled: () => {
      // Pequeno delay na invalidação para garantir que requisições assíncronas do supabase terminaram
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["database_rows", databaseId] });
        qc.invalidateQueries({ queryKey: ["pages"] });
      }, 700);
    },
  });

  // Atualizar metadados da linha (título, ícone, capa)
  const updateRowMeta = useMutation({
    mutationFn: async ({
      rowId,
      patch,
    }: {
      rowId: string;
      patch: { title?: string; icon?: string | null; cover?: string | null };
    }) => {
      const { error } = await supabase.from("pages").update(patch).eq("id", rowId);
      if (error) throw error;
    },
    onMutate: async ({ rowId, patch }) => {
      await qc.cancelQueries({ queryKey: ["database_rows", databaseId] });
      const prev = qc.getQueryData<DatabaseRow[]>(["database_rows", databaseId]);
      qc.setQueryData<DatabaseRow[]>(["database_rows", databaseId], (old) =>
        old?.map((r) => (r.id === rowId ? { ...r, ...patch } : r))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["database_rows", databaseId], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["database_rows", databaseId] });
      qc.invalidateQueries({ queryKey: ["pages"] });
    },
  });

  // Deletar / arquivar linha
  const deleteRow = useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.from("pages").update({ is_archived: true }).eq("id", rowId);
      if (error) throw error;
    },
    onMutate: async (rowId) => {
      await qc.cancelQueries({ queryKey: ["database_rows", databaseId] });
      const prev = qc.getQueryData<DatabaseRow[]>(["database_rows", databaseId]);
      qc.setQueryData<DatabaseRow[]>(["database_rows", databaseId], (old) =>
        old?.filter((r) => r.id !== rowId)
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["database_rows", databaseId], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["database_rows", databaseId] });
      qc.invalidateQueries({ queryKey: ["pages"] });
    },
  });

  // Atualizar schema de colunas na página database
  const updateSchema = useMutation({
    mutationFn: async (newSchema: ColumnSchema[]) => {
      const { error } = await supabase
        .from("pages")
        .update({ database_schema: newSchema })
        .eq("id", databaseId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["page", databaseId] });
    },
  });

  return {
    rows: rowsQuery.data ?? [],
    isLoading: rowsQuery.isLoading,
    addRow,
    updateCell,
    updateRowMeta,
    deleteRow,
    updateSchema,
  };
}