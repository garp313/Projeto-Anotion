"use client";
import { useState } from "react";
import Link from "next/link";
import { CalendarPlus, Check, Clock, Plus } from "lucide-react";
import { useDatabase } from "./useDatabase";
import { PropertyValue } from "./cells";
import { AddPropertyMenu } from "./PropertyMenu";
import { Choice, Pop, PropIcon, toolbarBtn } from "./ui";
import { DateText, TimeText, isoDay } from "./DatePicker";
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

const DURATIONS = [{ value: "30", label: "30 minutos" }, { value: "60", label: "1 hora" }, { value: "120", label: "2 horas" }, { value: "240", label: "4 horas" }];
const pad2 = (n: number) => String(n).padStart(2, "0");
const localStamp = (d: Date) => `${isoDay(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;

/** Bloco de foco: reserva tempo na agenda de quem clicou e convida os responsáveis. */
function FocusBlock({ row, db }: { row: DatabaseRow; db: Db }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(() => isoDay(new Date()));
  const [hour, setHour] = useState("09:00");
  const [minutes, setMinutes] = useState("60");
  const [state, setState] = useState<"idle" | "busy" | "done" | "connect" | "error">("idle");
  const [busyPeople, setBusyPeople] = useState<string[] | null>(null);

  const people = db.schema.filter((c) => c.type === "person")
    .flatMap((c) => (Array.isArray(row.row_properties?.[c.id]) ? row.row_properties[c.id] : []) as { id?: string; name: string }[])
    .filter((p) => p.id && p.id !== db.me?.id);
  const start = new Date(`${day}T${hour}:00`);
  const end = new Date(start.getTime() + Number(minutes) * 60_000);

  async function check() {
    const list = await Promise.all(people.map(async (p) => {
      const qs = new URLSearchParams({ userId: p.id!, start: start.toISOString(), end: end.toISOString() });
      const res = await fetch(`/api/google/freebusy?${qs}`).then((r) => r.json()).catch(() => null);
      return res?.available && res.busy.length ? p.name : null;
    }));
    setBusyPeople(list.filter((n): n is string => n !== null));
  }
  async function book() {
    setState("busy");
    const attendees = people.map((p) => db.members.find((m) => m.id === p.id)?.email).filter(Boolean);
    const res = await fetch("/api/calendar/events", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: `Foco: ${row.title || "Sem título"}`, allDay: false, attendees,
        start: localStamp(start), end: localStamp(end), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    setState(res.status === 401 ? "connect" : res.ok ? "done" : "error");
    if (res.ok) setOpen(false);
  }
  return (
    <Pop open={open} onOpenChange={(o) => { setOpen(o); if (o) { setState("idle"); setBusyPeople(null); } }} width={260} align="end" triggerClass={`${toolbarBtn} h-[30px] shrink-0`}
      trigger={<><Clock size={13} /> {state === "done" ? "Agendado" : "Agendar"}</>}>
      <div className="space-y-1 p-1">
        <p className="text-[11px] text-[var(--n-text-faint)]">Bloquear tempo na agenda</p>
        <div className="flex items-center gap-1">
          <span className="min-w-0 flex-1"><DateText label="Dia do bloco" value={day} onCommit={(v) => { if (v) { setDay(v); setBusyPeople(null); } }} /></span>
          <TimeText label="Hora do bloco" value={hour} onCommit={(t) => { setHour(t); setBusyPeople(null); }} />
        </div>
        <Choice label="Duração" value={minutes} options={DURATIONS} onChange={(m) => { setMinutes(m); setBusyPeople(null); }} />
        {people.length > 0 && (
          <button type="button" onClick={() => void check()} className="block text-xs text-[var(--n-accent)] underline">Ver disponibilidade do responsável</button>
        )}
        {busyPeople && <p role="status" className="text-xs text-[var(--n-text-muted)]">{busyPeople.length ? `Ocupado neste horário: ${busyPeople.join(", ")}` : "Sem conflito encontrado. Quem não conectou o Google não aparece aqui."}</p>}
        {state === "connect" && <Link href="/agenda" className="block text-xs underline">Conectar agenda</Link>}
        {state === "error" && <p role="alert" className="text-xs text-red-500">Não foi possível agendar.</p>}
        <button type="button" disabled={state === "busy"} onClick={() => void book()}
          className="w-full rounded bg-[var(--n-accent)] py-1 text-xs font-medium text-white hover:brightness-95 disabled:opacity-60">{state === "busy" ? "Agendando…" : "Agendar bloco"}</button>
      </div>
    </Pop>
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
          {c.type === "date" && db.page?.row_properties?.__calendarSync !== c.id && <AddToCalendar col={c} row={row} db={db} />}
          {c.type === "date" && <FocusBlock row={row} db={db} />}
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
