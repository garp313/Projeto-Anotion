"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { defaultView, type ColumnSchema } from "./types";
import { useDatabase, type Db } from "./useDatabase";
import { TableView } from "./views";

function Linked({ col, rowId }: { col: ColumnSchema; rowId: string }) {
  const router = useRouter();
  const target = useDatabase(col.relationDatabaseId!);
  const mirror = col.relationSyncProp!;
  const rows = useMemo(() => target.rows.filter((r) => (r.row_properties?.[mirror] ?? []).includes(rowId)), [target.rows, mirror, rowId]);
  const view = useMemo(() => ({ ...defaultView("table", target.schema), hidden: [mirror] }), [target.schema, mirror]);
  // A tarefa nova nasce ligada a este projeto, passando pela sincronização da relação.
  const db = {
    ...target,
    saveView: async () => {},
    addRow: async (init?: Parameters<Db["addRow"]>[0]) => {
      const row = await target.addRow(init);
      target.setValue(row.id, mirror, [rowId]);
      return row;
    },
  } as Db;
  return (
    <section aria-label={`${col.name} deste item`} className="mb-6">
      <h2 className="mb-1 text-sm font-semibold">{col.name} <span className="font-normal text-[var(--n-text-faint)]">{rows.length}</span></h2>
      <TableView db={db} view={view} rows={rows} open={(id) => router.push(`/workspace/${id}`)} defaults={{}} />
    </section>
  );
}

/** Lista na página do projeto as tarefas do banco Tarefas: é a mesma fonte dos números do rollup. */
export function RelatedPanel({ databaseId, rowId }: { databaseId: string; rowId: string }) {
  const { schema } = useDatabase(databaseId);
  const col = schema.find((c) => c.type === "relation" && c.relationDatabaseId && c.relationSyncProp && schema.some((s) => s.rollup?.relationProp === c.id));
  return col ? <Linked col={col} rowId={rowId} /> : null;
}
