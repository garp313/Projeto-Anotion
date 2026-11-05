import type { QueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ColumnSchema, SelectOption } from "./types";
import { DEFAULT_SCHEMA, READ_ONLY, newId } from "./types";

const withOptions = (c: ColumnSchema) => ["select", "status", "multi_select"].includes(c.type);
const sameKind = (a: ColumnSchema, b: ColumnSchema) =>
  a.type === b.type || (["select", "status"].includes(a.type) && ["select", "status"].includes(b.type));

/** Procura a coluna equivalente pelo nome; sem equivalente, copia para não perder o dado. */
function targetColumn(source: ColumnSchema, schema: ColumnSchema[]) {
  const named = schema.find((c) => c.name.toLowerCase() === source.name.toLowerCase());
  if (named && sameKind(source, named)) return named;
  const copy: ColumnSchema = { ...source, id: newId("p_"), name: named ? `${source.name} (demandas)` : source.name };
  schema.push(copy);
  return copy;
}

/** Opção de mesmo nome no destino, criando a que faltar: assim status como "Em Atendimento" não se perdem. */
function targetOption(option: SelectOption, target: ColumnSchema) {
  const found = target.options?.find((o) => o.value.toLowerCase() === option.value.toLowerCase());
  if (found) return found.id;
  const created: SelectOption = { ...option, id: newId("o_"), ...(target.type === "status" ? { group: option.group ?? "todo" } : {}) };
  target.options = [...(target.options ?? []), created];
  return created.id;
}

/**
 * Leva as linhas de uma tabela interna de projeto para o banco Tarefas, ligadas ao projeto.
 * As linhas mudam de lugar, com conteúdo e comentários, e a tabela vazia vai para a lixeira.
 */
export async function moveRowsToTasks(qc: QueryClient, sourceId: string) {
  const supabase = createClient();
  const { data: source, error } = await supabase.from("pages").select("id,parent_id,database_schema").eq("id", sourceId).single();
  if (error) throw error;
  const { data: tasks } = await supabase.from("pages").select("id,database_schema").eq("is_database", true)
    .eq("is_archived", false).eq("title", "Tarefas").neq("id", sourceId).limit(1).maybeSingle();
  if (!tasks) throw new Error("Banco Tarefas não encontrado");
  const { data: project } = source.parent_id
    ? await supabase.from("pages").select("id,parent_id,row_properties").eq("id", source.parent_id).single()
    : { data: null };

  const schema: ColumnSchema[] = (tasks.database_schema?.length ? tasks.database_schema : DEFAULT_SCHEMA).map((c: ColumnSchema) => ({ ...c }));
  const link = schema.find((c) => c.type === "relation" && project?.parent_id && c.relationDatabaseId === project.parent_id);
  const columns: ColumnSchema[] = (source.database_schema?.length ? source.database_schema : DEFAULT_SCHEMA)
    .filter((c: ColumnSchema) => c.type !== "title" && c.type !== "relation" && !READ_ONLY.includes(c.type));
  const pairs = columns.map((from) => ({ from, to: targetColumn(from, schema) }));

  const { data: rows, error: rowsError } = await supabase.from("pages").select("id,row_properties").eq("parent_id", sourceId).eq("is_archived", false);
  if (rowsError) throw rowsError;

  const moved = (rows ?? []).map((row) => {
    const props: Record<string, any> = {};
    for (const { from, to } of pairs) {
      const value = row.row_properties?.[from.id];
      if (value === undefined || value === null) continue;
      if (!withOptions(from)) { props[to.id] = value; continue; }
      const convert = (id: string) => {
        const option = from.options?.find((o) => o.id === id || o.value === id);
        return option ? targetOption(option, to) : null;
      };
      props[to.id] = Array.isArray(value) ? value.map(convert).filter(Boolean) : convert(value);
    }
    if (link && project) props[link.id] = [project.id];
    return { id: row.id, props };
  });

  // Esquema primeiro: nenhuma linha pode chegar apontando para coluna ou opção que ainda não existe.
  const written = await supabase.from("pages").update({ database_schema: schema }).eq("id", tasks.id);
  if (written.error) throw written.error;
  for (const row of moved) {
    const { error: moveError } = await supabase.from("pages").update({ parent_id: tasks.id, row_properties: row.props }).eq("id", row.id);
    if (moveError) throw moveError;
  }
  if (link?.relationSyncProp && project) {
    const cur: string[] = project.row_properties?.[link.relationSyncProp] ?? [];
    await supabase.from("pages").update({
      row_properties: { ...project.row_properties, [link.relationSyncProp]: [...new Set([...cur, ...moved.map((r) => r.id)])] },
    }).eq("id", project.id);
  }
  await supabase.from("pages").update({ is_archived: true }).eq("id", sourceId);

  for (const key of [["database_rows"], ["pages"], ["tasks"], ["page", tasks.id], ["page", sourceId]]) qc.invalidateQueries({ queryKey: key });
  return moved.length;
}
