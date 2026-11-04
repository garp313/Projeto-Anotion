"use client";
import { useState } from "react";
import Link from "next/link";
import { CalendarPlus, Check, Plus } from "lucide-react";
import { useDatabase } from "./useDatabase";
import { PropertyValue } from "./cells";
import { AddPropertyMenu } from "./PropertyMenu";
import { Pop, PropIcon } from "./ui";
import { asDate, rawValue } from "./values";
import type { ColumnSchema, DatabaseRow } from "./types";
import type { Db } from "./useDatabase";

/** Envia a data da demanda para o Google Agenda e guarda o id do evento para não duplicar. */
function AddToCalendar({ col, row, db }: { col: ColumnSchema; row: DatabaseRow; db: Db }) {
  const [state, setState] = useState<"idle" | "busy" | "connect" | "error">("idle");
  const value = asDate(rawValue(col, row, db.ctx));
  const key = `__gcal_${col.id}`;
  if (!value) return null;
  if (row.row_properties?.[key]) return <span className="flex h-[30px] items-center gap-1 px-2 text-xs text-[var(--n-text-faint)]"><Check size={12} /> Na agenda</span>;
  if (state === "connect") return <Link href="/agenda" className="flex h-[30px] items-center px-2 text-xs underline">Conectar agenda</Link>;
  async function add() {
    setState("busy");
    const res = await fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary: row.title || "Sem título", ...toEventTimes(value!) }),
    });
    if (res.status === 401) return setState("connect");
    if (!res.ok) return setState("error");
    db.setValue(row.id, key, (await res.json()).id);
    setState("idle");
  }
  return (
    <button type="button" onClick={add} disabled={state === "busy"} title="Adicionar ao Google Agenda"
      className="flex h-[30px] shrink-0 items-center gap-1 rounded px-2 text-xs text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]">
      <CalendarPlus size={13} /> {state === "error" ? "Erro, tentar de novo" : state === "busy" ? "Enviando…" : "Agenda"}
    </button>
  );
}

function toEventTimes(v: { start: string; end?: string | null; time?: boolean }) {
  if (v.time) {
    const start = new Date(v.start);
    const end = v.end ? new Date(v.end) : new Date(start.getTime() + 3_600_000);
    return { start: start.toISOString(), end: end.toISOString(), allDay: false };
  }
  return { start: v.start.slice(0, 10), end: (v.end ?? v.start).slice(0, 10), allDay: true };
}

/** Propriedades no topo da página de uma linha, como no Notion. */
export function RowProperties({ databaseId, rowId }: { databaseId: string; rowId: string }) {
  const db = useDatabase(databaseId);
  const [adding, setAdding] = useState(false);
  const row = db.rows.find((r) => r.id === rowId);
  if (!row) return null;
  return (
    <section aria-label="Propriedades" className="mb-4 border-b border-[var(--n-border)] pb-3">
      {db.schema.filter((c) => c.type !== "title").map((c) => (
        <div key={c.id} className="flex items-start gap-2 rounded hover:bg-[var(--n-hover)]/40">
          <span className="flex h-[30px] w-40 shrink-0 items-center gap-1.5 px-1 text-sm text-[var(--n-text-muted)]">
            <PropIcon type={c.type} /> <span className="truncate">{c.name}</span>
          </span>
          <div className="min-w-0 flex-1"><PropertyValue col={c} row={row} db={db} /></div>
          {c.type === "date" && <AddToCalendar col={c} row={row} db={db} />}
        </div>
      ))}
      <Pop open={adding} onOpenChange={setAdding} width={230}
        triggerClass="mt-1 flex items-center gap-1.5 rounded px-1 py-1 text-sm text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]"
        trigger={<><Plus size={14} /> Adicionar propriedade</>}>
        <AddPropertyMenu db={db} onDone={() => setAdding(false)} />
      </Pop>
    </section>
  );
}
