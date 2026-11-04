"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { loadTasks, type Task } from "@/lib/tasks";

type Calendar = { id: string; name: string; color?: string; primary: boolean; writable: boolean };
type GEvent = {
  id: string; calendarId: string; color?: string; writable: boolean; summary?: string; description?: string; location?: string;
  htmlLink?: string; start: { date?: string; dateTime?: string }; end: { date?: string; dateTime?: string };
  attendees?: { email: string }[];
};
type Draft = {
  id?: string; calendarId: string; summary: string; description: string; location: string;
  allDay: boolean; start: string; end: string; attendees: string; htmlLink?: string;
};

const DAY = 86_400_000;
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HOUR_H = 44;
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const local = (d: Date) => `${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d: Date) => addDays(d, -d.getDay());
const time = (s: string) => new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const eventStart = (e: GEvent) => new Date(e.start.dateTime ?? `${e.start.date}T00:00:00`);
/** Último instante do evento; o fim de dia inteiro no Google é exclusivo. */
const eventEnd = (e: GEvent) => (e.end.dateTime ? new Date(e.end.dateTime) : addDays(new Date(`${e.end.date}T00:00:00`), -1));

function range(view: "month" | "week", anchor: Date) {
  if (view === "week") { const s = startOfWeek(anchor); return { start: s, days: 7 }; }
  return { start: startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1)), days: 42 };
}

class NotConnectedError extends Error {}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (res.status === 401) throw new NotConnectedError();
  if (!res.ok) throw new Error("Não foi possível falar com o Google Agenda.");
  return res.status === 204 ? null : res.json();
}

async function connect() {
  // O callback lê este cookie para saber que deve guardar os tokens e voltar para cá.
  document.cookie = "after_auth=/agenda; path=/; max-age=600; samesite=lax";
  await createClient().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes: "https://www.googleapis.com/auth/calendar",
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });
}

function newDraft(day: Date, calendarId: string, hour = 9): Draft {
  const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);
  return {
    calendarId, summary: "", description: "", location: "", attendees: "", allDay: false,
    start: local(s), end: local(new Date(s.getTime() + 3_600_000)),
  };
}

function toDraft(e: GEvent): Draft {
  const allDay = Boolean(e.start.date);
  return {
    id: e.id, calendarId: e.calendarId, summary: e.summary ?? "", description: e.description ?? "", location: e.location ?? "",
    allDay, htmlLink: e.htmlLink, attendees: e.attendees?.map((a) => a.email).join(", ") ?? "",
    start: allDay ? e.start.date! : local(new Date(e.start.dateTime!)),
    end: allDay ? iso(eventEnd(e)) : local(new Date(e.end.dateTime!)),
  };
}

function EventDialog({ draft, calendars, onClose, onSave, onDelete, busy, error }: {
  draft: Draft; calendars: Calendar[]; onClose: () => void; onSave: (d: Draft) => void; onDelete: (d: Draft) => void; busy: boolean; error: string | null;
}) {
  const [d, setD] = useState(draft);
  const [confirming, setConfirming] = useState(false);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const field = "w-full rounded border border-[var(--n-border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--n-accent)]";
  const label = "mb-1 block text-xs text-[var(--n-text-muted)]";
  const toggleAllDay = (allDay: boolean) =>
    set(allDay ? { allDay, start: d.start.slice(0, 10), end: d.end.slice(0, 10) } : { allDay, start: `${d.start.slice(0, 10)}T09:00`, end: `${d.end.slice(0, 10)}T10:00` });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const invalid = !d.summary.trim() || !d.start || !d.end || d.end < d.start;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label={d.id ? "Editar evento" : "Novo evento"}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="w-full max-w-md space-y-3 rounded-lg border border-[var(--n-border)] bg-[var(--n-bg)] p-4 shadow-2xl"
        onSubmit={(e) => { e.preventDefault(); if (!invalid) onSave(d); }}>
        <div className="flex items-center gap-2">
          <input autoFocus required aria-label="Título" placeholder="Adicionar título" value={d.summary} onChange={(e) => set({ summary: e.target.value })}
            className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-[var(--n-text-faint)]" />
          {d.htmlLink && <a href={d.htmlLink} target="_blank" rel="noreferrer" aria-label="Abrir no Google Agenda" className="rounded p-1 hover:bg-[var(--n-hover)]"><ExternalLink size={15} /></a>}
          <button type="button" aria-label="Fechar" onClick={onClose} className="rounded p-1 hover:bg-[var(--n-hover)]"><X size={16} /></button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.allDay} onChange={(e) => toggleAllDay(e.target.checked)} className="accent-[var(--n-accent)]" /> Dia inteiro
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label><span className={label}>Início</span><input className={field} type={d.allDay ? "date" : "datetime-local"} value={d.start} onChange={(e) => set({ start: e.target.value })} /></label>
          <label><span className={label}>Fim</span><input className={field} type={d.allDay ? "date" : "datetime-local"} value={d.end} onChange={(e) => set({ end: e.target.value })} /></label>
        </div>
        {!d.id && (
          <label className="block"><span className={label}>Agenda</span>
            <select className={`${field} bg-[var(--n-bg)]`} value={d.calendarId} onChange={(e) => set({ calendarId: e.target.value })}>
              {calendars.filter((c) => c.writable).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label className="block"><span className={label}>Local</span><input className={field} value={d.location} onChange={(e) => set({ location: e.target.value })} /></label>
        <label className="block"><span className={label}>Convidados (e-mails separados por vírgula; eles recebem convite)</span>
          <input className={field} value={d.attendees} onChange={(e) => set({ attendees: e.target.value })} /></label>
        <label className="block"><span className={label}>Descrição</span><textarea rows={3} className={field} value={d.description} onChange={(e) => set({ description: e.target.value })} /></label>
        {d.end < d.start && <p role="alert" className="text-xs text-red-500">O fim precisa ser depois do início.</p>}
        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
        <div className="flex items-center gap-2">
          {d.id && (confirming
            ? <button type="button" disabled={busy} onClick={() => onDelete(d)} className="rounded bg-red-500 px-2 py-1 text-sm text-white">Confirmar exclusão</button>
            : <button type="button" onClick={() => setConfirming(true)} className="flex items-center gap-1 rounded px-2 py-1 text-sm text-red-500 hover:bg-[var(--n-hover)]"><Trash2 size={14} /> Excluir</button>)}
          <button disabled={busy || invalid} className="ml-auto rounded bg-[var(--n-accent)] px-3 py-1 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50">
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Chip({ e, onOpen }: { e: GEvent; onOpen: (e: GEvent) => void }) {
  return (
    <button type="button" onClick={(ev) => { ev.stopPropagation(); onOpen(e); }} style={{ background: e.start.date ? e.color : undefined }}
      className={`mt-0.5 flex w-full items-center gap-1 truncate rounded px-1 text-left text-xs hover:brightness-95 ${e.start.date ? "text-black/80" : "hover:bg-[var(--n-hover)]"}`}>
      {!e.start.date && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: e.color }} />}
      <span className="truncate">{e.start.dateTime && `${time(e.start.dateTime)} `}{e.summary || "(Sem título)"}</span>
    </button>
  );
}

const onDay = (e: GEvent, d: Date) => {
  const s = addDays(d, 0).getTime();
  return eventStart(e).getTime() < s + DAY && eventEnd(e).getTime() >= s;
};

function MonthGrid({ start, anchor, events, onDayClick, onOpen }: {
  start: Date; anchor: Date; events: GEvent[]; onDayClick: (d: Date) => void; onOpen: (e: GEvent) => void;
}) {
  const today = iso(new Date());
  return (
    <div className="grid grid-cols-7 border-l border-t border-[var(--n-border)]">
      {WEEKDAYS.map((d) => <div key={d} className="border-b border-r border-[var(--n-border)] px-2 py-1 text-right text-xs text-[var(--n-text-faint)]">{d}</div>)}
      {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((d) => {
        const list = events.filter((e) => onDay(e, d));
        return (
          <div key={iso(d)} role="button" tabIndex={0} aria-label={`Criar evento em ${d.toLocaleDateString("pt-BR")}`}
            onClick={() => onDayClick(d)} onKeyDown={(e) => { if (e.key === "Enter") onDayClick(d); }}
            className={`min-h-[104px] min-w-0 cursor-pointer border-b border-r border-[var(--n-border)] p-1 hover:bg-[var(--n-hover)]/30 ${d.getMonth() === anchor.getMonth() ? "" : "opacity-40"}`}>
            <div className="flex justify-end">
              <span className={`grid h-5 min-w-5 place-items-center rounded-full text-xs ${iso(d) === today ? "bg-red-500 text-white" : "text-[var(--n-text-muted)]"}`}>{d.getDate()}</span>
            </div>
            {list.slice(0, 4).map((e) => <Chip key={`${e.calendarId}${e.id}`} e={e} onOpen={onOpen} />)}
            {list.length > 4 && <p className="mt-0.5 px-1 text-[11px] text-[var(--n-text-faint)]">+{list.length - 4} mais</p>}
          </div>
        );
      })}
    </div>
  );
}

function WeekGrid({ start, events, onSlot, onOpen }: {
  start: Date; events: GEvent[]; onSlot: (d: Date, hour: number) => void; onOpen: (e: GEvent) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = iso(new Date());
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 7 * HOUR_H; }, []); // início do expediente
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="n-scroll overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] border-b border-[var(--n-border)]">
          <span />
          {days.map((d) => (
            <div key={iso(d)} className="min-w-0 border-l border-[var(--n-border)] p-1 text-center">
              <p className="text-[11px] text-[var(--n-text-faint)]">{WEEKDAYS[d.getDay()]}</p>
              <p className={`mx-auto grid h-6 w-6 place-items-center rounded-full text-sm ${iso(d) === today ? "bg-red-500 text-white" : ""}`}>{d.getDate()}</p>
              {events.filter((e) => e.start.date && onDay(e, d)).map((e) => <Chip key={`${e.calendarId}${e.id}`} e={e} onOpen={onOpen} />)}
            </div>
          ))}
        </div>
        <div ref={scroller} className="n-scroll max-h-[65vh] overflow-y-auto">
          <div className="relative grid grid-cols-[48px_repeat(7,minmax(0,1fr))]" style={{ height: 24 * HOUR_H }}>
            <div>{Array.from({ length: 24 }, (_, h) => <div key={h} style={{ height: HOUR_H }} className="pr-1 text-right text-[10px] text-[var(--n-text-faint)]">{pad(h)}:00</div>)}</div>
            {days.map((d) => (
              <div key={iso(d)} className="relative border-l border-[var(--n-border)]">
                {Array.from({ length: 24 }, (_, h) => (
                  <button key={h} type="button" aria-label={`Criar evento ${d.toLocaleDateString("pt-BR")} às ${h}h`} onClick={() => onSlot(d, h)}
                    style={{ height: HOUR_H }} className="block w-full border-b border-[var(--n-border)] hover:bg-[var(--n-hover)]/40" />
                ))}
                {iso(d) === today && (
                  <span aria-label="Hora atual" style={{ top: (now.getHours() + now.getMinutes() / 60) * HOUR_H }}
                    className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-red-500 before:absolute before:-left-1 before:-top-1 before:h-2.5 before:w-2.5 before:rounded-full before:bg-red-500" />
                )}
                {events.filter((e) => e.start.dateTime && iso(eventStart(e)) === iso(d)).map((e) => {
                  const s = eventStart(e), end = eventEnd(e);
                  const top = (s.getHours() + s.getMinutes() / 60) * HOUR_H;
                  const h = Math.max(20, ((end.getTime() - s.getTime()) / 3_600_000) * HOUR_H);
                  return (
                    <button key={`${e.calendarId}${e.id}`} type="button" onClick={() => onOpen(e)} style={{ top, height: h, background: e.color }}
                      className="absolute inset-x-0.5 overflow-hidden rounded px-1 text-left text-[11px] leading-tight text-black/80 hover:brightness-95">
                      <b className="block truncate font-medium">{e.summary || "(Sem título)"}</b>{time(e.start.dateTime!)}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const TASKS_CALENDAR = "__tasks";

/** Prazo de tarefa no formato de evento, para reaproveitar as grades de mês e semana. */
function taskEvent(t: Task): GEvent | null {
  if (!t.due || t.done) return null;
  const base = { id: `task:${t.id}`, calendarId: TASKS_CALENDAR, color: "#c4b5fd", writable: false, summary: `☑ ${t.title || "Sem título"}` };
  const last = (t.due.end ?? t.due.start);
  if (t.due.time) return { ...base, start: { dateTime: t.due.start }, end: { dateTime: t.due.end ?? new Date(new Date(t.due.start).getTime() + 1_800_000).toISOString() } };
  return { ...base, start: { date: t.due.start.slice(0, 10) }, end: { date: iso(addDays(new Date(`${last.slice(0, 10)}T00:00:00`), 1)) } };
}

export function Agenda({ initialDate }: { initialDate?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [view, setView] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(() => (initialDate ? new Date(`${initialDate}T12:00:00`) : new Date()));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const { start, days } = useMemo(() => range(view, anchor), [view, anchor]);
  const key = ["calendar", iso(start), days];

  useEffect(() => {
    try { setHidden(JSON.parse(localStorage.getItem("agenda-hidden") ?? "[]")); } catch { /* armazenamento indisponível */ }
  }, []);
  const toggleCalendar = (id: string) => setHidden((h) => {
    const next = h.includes(id) ? h.filter((x) => x !== id) : [...h, id];
    try { localStorage.setItem("agenda-hidden", JSON.stringify(next)); } catch { /* armazenamento indisponível */ }
    return next;
  });

  const { data, error, isLoading, isFetching } = useQuery({
    queryKey: key,
    queryFn: () => {
      const qs = new URLSearchParams({ timeMin: start.toISOString(), timeMax: addDays(start, days).toISOString() });
      return api(`/api/calendar/events?${qs}`) as Promise<{ calendars: Calendar[]; events: GEvent[] }>;
    },
    placeholderData: keepPreviousData,
    retry: false,
  });

  const tasks = useQuery({ queryKey: ["tasks"], queryFn: loadTasks });

  const refresh = () => qc.invalidateQueries({ queryKey: ["calendar"] });
  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body = {
        calendarId: d.calendarId, summary: d.summary.trim(), description: d.description, location: d.location, allDay: d.allDay,
        start: d.allDay ? d.start : new Date(d.start).toISOString(),
        end: d.allDay ? d.end : new Date(d.end).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        attendees: d.attendees.split(",").map((s) => s.trim()).filter(Boolean),
      };
      return api(d.id ? `/api/calendar/events/${encodeURIComponent(d.id)}` : "/api/calendar/events", {
        method: d.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => { setDraft(null); refresh(); },
  });
  const remove = useMutation({
    mutationFn: (d: Draft) => api(`/api/calendar/events/${encodeURIComponent(d.id!)}?calendarId=${encodeURIComponent(d.calendarId)}`, { method: "DELETE" }),
    onSuccess: () => { setDraft(null); refresh(); },
  });

  const notConnected = error instanceof NotConnectedError;
  const calendars = data?.calendars ?? [];
  const toggles = [...calendars, { id: TASKS_CALENDAR, name: "Prazos de tarefas", color: "#c4b5fd", primary: false, writable: false }];
  const taskEvents = useMemo(() => (tasks.data?.tasks ?? []).map(taskEvent).filter((e): e is GEvent => Boolean(e)), [tasks.data]);
  const events = [...(notConnected ? [] : data?.events ?? []), ...taskEvents].filter((e) => !hidden.includes(e.calendarId));
  const defaultCalendar = calendars.find((c) => c.primary)?.id ?? calendars.find((c) => c.writable)?.id ?? "primary";
  const open = (e: GEvent) => { if (e.id.startsWith("task:")) router.push(`/workspace/${e.id.slice(5)}`); else if (e.writable) { save.reset(); remove.reset(); setDraft(toDraft(e)); } else if (e.htmlLink) window.open(e.htmlLink, "_blank", "noopener"); };
  const create = (d: Date, hour?: number) => { if (notConnected) return; save.reset(); setDraft(newDraft(d, defaultCalendar, hour)); };
  const shift = (n: number) => setAnchor((a) => (view === "week" ? addDays(a, 7 * n) : new Date(a.getFullYear(), a.getMonth() + n, 1)));
  const title = view === "month"
    ? anchor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    : `${start.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} – ${addDays(start, 6).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="mx-auto w-full max-w-[1200px] p-6 sm:px-10">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold">{title}</h1>
        {isFetching && !isLoading && <span className="text-xs text-[var(--n-text-faint)]">Atualizando…</span>}
        <div className="flex rounded border border-[var(--n-border)] text-xs">
          {(["month", "week"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
              className={`px-2 py-1 ${view === v ? "bg-[var(--n-active)] font-medium" : "text-[var(--n-text-muted)]"}`}>{v === "month" ? "Mês" : "Semana"}</button>
          ))}
        </div>
        <button type="button" aria-label="Anterior" onClick={() => shift(-1)} className="rounded p-1 hover:bg-[var(--n-hover)]"><ChevronLeft size={16} /></button>
        <button type="button" onClick={() => setAnchor(new Date())} className="rounded px-2 py-1 text-xs hover:bg-[var(--n-hover)]">Hoje</button>
        <button type="button" aria-label="Próximo" onClick={() => shift(1)} className="rounded p-1 hover:bg-[var(--n-hover)]"><ChevronRight size={16} /></button>
        <button type="button" disabled={notConnected} onClick={() => create(new Date())} className="flex items-center gap-1 rounded bg-[var(--n-accent)] px-2 py-1 text-xs font-medium text-white hover:brightness-95 disabled:opacity-50"><Plus size={13} /> Novo evento</button>
      </header>

      {notConnected && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-[var(--n-border)] px-3 py-2 text-sm">
          <CalendarDays size={16} className="text-[var(--n-text-faint)]" />
          <span className="min-w-0 flex-1 text-[var(--n-text-muted)]">Conecte o Google Agenda para ver e criar compromissos aqui.</span>
          <button type="button" onClick={connect} className="rounded-md bg-[var(--n-accent)] px-2.5 py-1 text-xs font-medium text-white hover:brightness-95">Conectar com Google</button>
        </div>
      )}

      {toggles.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-3 text-xs text-[var(--n-text-muted)]">
          {toggles.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={!hidden.includes(c.id)} onChange={() => toggleCalendar(c.id)} style={{ accentColor: c.color }} /> {c.name}
            </label>
          ))}
        </div>
      )}

      {error && !notConnected
        ? <p role="alert" className="py-10 text-center text-sm text-red-500">{error.message}</p>
        : isLoading && !notConnected ? <div className="h-96 animate-pulse rounded bg-[var(--n-hover)]/40" />
        : view === "month"
          ? <MonthGrid start={start} anchor={anchor} events={events} onDayClick={(d) => create(d)} onOpen={open} />
          : <WeekGrid start={start} events={events} onSlot={create} onOpen={open} />}

      {draft && (
        <EventDialog
          key={draft.id ?? "new"} draft={draft} calendars={calendars} busy={save.isPending || remove.isPending}
          error={save.error?.message ?? remove.error?.message ?? null}
          onClose={() => setDraft(null)} onSave={(d) => save.mutate(d)} onDelete={(d) => remove.mutate(d)}
        />
      )}
    </div>
  );
}
