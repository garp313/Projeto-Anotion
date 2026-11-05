import type { QueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { PageFull } from "@/lib/hooks/usePageTree";
import type { ColumnSchema } from "./types";
import { DEFAULT_SCHEMA, newId } from "./types";

type DbInfo = { id: string; title: string; schema: ColumnSchema[] };

async function load(id: string): Promise<DbInfo | null> {
  const { data } = await createClient().from("pages").select("id,title,database_schema").eq("id", id).single();
  if (!data) return null;
  return { id: data.id, title: data.title, schema: data.database_schema?.length ? data.database_schema : DEFAULT_SCHEMA };
}

async function writeSchema(qc: QueryClient, id: string, schema: ColumnSchema[]) {
  const { error } = await createClient().from("pages").update({ database_schema: schema }).eq("id", id);
  if (error) throw error;
  qc.setQueryData<PageFull>(["page", id], (old) => (old ? { ...old, database_schema: schema } : old));
}

/** Cria no banco de destino a propriedade espelho e devolve o id dela. */
export async function addMirror(qc: QueryClient, targetId: string, name: string, sourceId: string, sourceColId: string, rollups: ColumnSchema[] = []) {
  const target = await load(targetId);
  if (!target) throw new Error("Banco de destino não encontrado");
  const mirror: ColumnSchema = { id: newId("p_"), name, type: "relation", relationDatabaseId: sourceId, relationSyncProp: sourceColId };
  const copies = rollups.map((c) => ({ ...c, id: newId("p_"), rollup: { ...c.rollup!, relationProp: mirror.id } }));
  await writeSchema(qc, targetId, [...target.schema, mirror, ...copies]);
  return mirror.id;
}

/** Rollups que dependem do espelho: trocar o banco da relação leva eles junto. */
export async function rollupsOf(targetId: string, mirrorId: string) {
  return (await load(targetId))?.schema.filter((c) => c.rollup?.relationProp === mirrorId) ?? [];
}

/** Desfaz o vínculo sem apagar a coluna do outro lado: ela continua como relação de uma via. */
export async function detachMirror(qc: QueryClient, targetId: string, mirrorId: string) {
  const target = await load(targetId);
  if (!target) return;
  await writeSchema(qc, targetId, target.schema.map((c) => (c.id === mirrorId ? { ...c, relationSyncProp: undefined } : c)));
}

export async function removeMirror(qc: QueryClient, targetId: string, mirrorId: string) {
  const target = await load(targetId);
  if (target) await writeSchema(qc, targetId, target.schema.filter((c) => c.id !== mirrorId && c.rollup?.relationProp !== mirrorId));
}

/** A propriedade do outro lado ainda é a relação esperada? Sem isso a sincronização sobrescreveria outro dado. */
export async function mirrorIsValid(targetId: string, mirrorId: string) {
  const target = await load(targetId);
  return target?.schema.find((c) => c.id === mirrorId)?.type === "relation";
}

const rowsOf = async (databaseId: string) => {
  const { data, error } = await createClient().from("pages").select("id,row_properties").eq("parent_id", databaseId).eq("is_archived", false);
  if (error) throw error;
  return (data ?? []) as { id: string; row_properties: Record<string, any> | null }[];
};

/**
 * Reconstrói o espelho de `link` (relação em `host`) dentro de `other`.
 * `broken` é a coluna que deveria ser o espelho: ela é preservada, sem os campos de relação.
 */
async function rebuild(qc: QueryClient, host: DbInfo, link: ColumnSchema, other: DbInfo, broken?: ColumnSchema) {
  const supabase = createClient();
  const mirror: ColumnSchema = {
    id: newId("p_"), name: broken?.name ?? host.title ?? "Relação", type: "relation",
    relationDatabaseId: host.id, relationSyncProp: link.id,
  };
  const taken = new Set(other.schema.map((c) => c.name));
  const keptName = (c: ColumnSchema) => {
    const wanted = c.type === "status" && !taken.has("Status") ? "Status" : `${c.name} (antigo)`;
    return taken.has(wanted) ? `${wanted} 2` : wanted;
  };
  const schema: ColumnSchema[] = other.schema.flatMap((c) => {
    if (broken && c.id === broken.id) {
      const { relationDatabaseId: _a, relationSyncProp: _b, ...rest } = c;
      return [{ ...rest, name: keptName(c) }, mirror];
    }
    return c.rollup?.relationProp === broken?.id && broken
      ? [{ ...c, rollup: { ...c.rollup!, relationProp: mirror.id } }]
      : [c];
  });
  if (!broken) schema.push(mirror);

  // Refaz os vínculos a partir do lado que continua íntegro.
  const back = new Map<string, string[]>();
  for (const row of await rowsOf(host.id)) {
    const ids = row.row_properties?.[link.id];
    if (Array.isArray(ids)) for (const id of ids) back.set(id, [...(back.get(id) ?? []), row.id]);
  }
  await Promise.all((await rowsOf(other.id)).map(async (row) => {
    const props = { ...row.row_properties };
    let changed = false;
    // Lista de ids dentro de uma coluna que não é relação é o rastro da sobrescrita.
    if (broken && Array.isArray(props[broken.id])) { delete props[broken.id]; changed = true; }
    if (back.has(row.id)) { props[mirror.id] = back.get(row.id); changed = true; }
    if (!changed) return;
    const { error } = await supabase.from("pages").update({ row_properties: props }).eq("id", row.id);
    if (error) throw error;
  }));

  await writeSchema(qc, other.id, schema);
  await writeSchema(qc, host.id, host.schema.map((c) => (c.id === link.id ? { ...c, relationSyncProp: mirror.id } : c)));
  qc.invalidateQueries({ queryKey: ["database_rows", other.id] });
  qc.invalidateQueries({ queryKey: ["database_rows", host.id] });
}

const checked = new Set<string>();

/** Conserta, uma vez por sessão, relações cujo espelho sumiu ou mudou de tipo. */
export async function repairRelations(qc: QueryClient, databaseId: string) {
  if (checked.has(databaseId)) return;
  checked.add(databaseId);
  const self = await load(databaseId);
  if (!self) return;
  for (const col of self.schema) {
    if (!col.relationDatabaseId || !col.relationSyncProp || col.relationDatabaseId === databaseId) continue;
    const other = await load(col.relationDatabaseId);
    if (!other) continue;
    const peer = other.schema.find((c) => c.id === col.relationSyncProp);
    if (col.type === "relation") {
      if (peer?.type !== "relation") await rebuild(qc, self, col, other, peer);
    } else if (peer?.type === "relation") {
      await rebuild(qc, other, peer, self, col);
    }
  }
}
