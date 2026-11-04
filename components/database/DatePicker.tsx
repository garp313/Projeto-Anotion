"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { DateValue, Repeat } from "./types";
import { Choice, fieldClass, menuItem } from "./ui";

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d); };

/** "1/11/2026" vira "2026-11-01". Ano fora de 1900–2100 ou dia inexistente é recusado. */
export function parseBr(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < 1900 || year > 2100) return null;
  const d = new Date(year, month - 1, day);
  return d.getMonth() === month - 1 && d.getDate() === day ? isoDay(d) : null;
}
export const toBr = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

const maskDate = (s: string) => {
  const n = s.replace(/\D/g, "").slice(0, 8);
  return [n.slice(0, 2), n.slice(2, 4), n.slice(4)].filter(Boolean).join("/");
};

/** Clicar sobre texto já selecionado desfaz a seleção depois do mouseup: selecionar antes disso não dura. */
const selectLater = (el: HTMLInputElement) => {
  el.select();
  const before = el.value;
  // Se já começou a digitar, selecionar agora apagaria o que entrou.
  requestAnimationFrame(() => { if (el.value === before) el.select(); });
};

/**
 * Data digitada como dd/mm/aaaa. Só grava ao sair do campo, com Enter ou ao fechar o menu:
 * o campo nativo entregava "0002-11-01" enquanto o ano ainda estava sendo digitado.
 */
export function DateText({ value, onCommit, label, className = fieldClass }: {
  value: string; onCommit: (iso: string) => void; label: string; className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const live = useRef({ draft, value, onCommit });
  live.current = { draft, value, onCommit };

  const flush = () => {
    const { draft: d, value: v, onCommit: send } = live.current;
    if (d === null) return true;
    const next = d.trim() ? parseBr(d) : "";
    if (next === null) return false;
    live.current.draft = null;
    if (next !== v.slice(0, 10)) send(next);
    return true;
  };
  // Clicar fora desmonta o campo antes do blur: sem isso a data digitada se perderia.
  useEffect(() => () => { flush(); }, []);

  const commit = () => {
    if (flush()) { setDraft(null); setBad(false); } else setBad(true);
  };
  return (
    <span className="block min-w-0">
      <input
        aria-label={label} aria-invalid={bad} inputMode="numeric" placeholder="dd/mm/aaaa"
        value={draft ?? toBr(value)} className={`${className} ${bad ? "border-red-500" : ""}`}
        onFocus={(e) => e.currentTarget.select()}
        onMouseUp={(e) => { if (draft === null || bad) selectLater(e.currentTarget); }}
        onChange={(e) => {
          // Dígito a mais num campo cheio recomeça a data: redigitar não pode depender da seleção.
          const typed = (e.nativeEvent as InputEvent).data;
          const overflow = e.target.value.replace(/\D/g, "").length > 8;
          setDraft(maskDate(overflow && typed ? typed : e.target.value));
          setBad(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { live.current.draft = null; setDraft(null); setBad(false); }
        }}
      />
      {bad && <span role="alert" className="mt-0.5 block text-[11px] text-red-500">Data inválida. Use dd/mm/aaaa.</span>}
    </span>
  );
}

export function TimeText({ value, onCommit, label }: { value: string; onCommit: (t: string) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const live = useRef({ draft, value, onCommit });
  live.current = { draft, value, onCommit };
  const flush = () => {
    const { draft: d, value: v, onCommit: send } = live.current;
    if (d === null) return;
    live.current.draft = null;
    const m = /^(\d{1,2}):?(\d{2})$/.exec(d.trim());
    if (m && Number(m[1]) < 24 && Number(m[2]) < 60) {
      const t = `${pad(Number(m[1]))}:${m[2]}`;
      if (t !== v) send(t);
    }
  };
  useEffect(() => () => flush(), []);
  return (
    <input aria-label={label} inputMode="numeric" placeholder="hh:mm" maxLength={5} value={draft ?? value}
      className={`${fieldClass} w-[68px] shrink-0`}
      onFocus={(e) => e.currentTarget.select()}
      onMouseUp={(e) => { if (draft === null) selectLater(e.currentTarget); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { flush(); setDraft(null); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); flush(); setDraft(null); } }} />
  );
}

const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];

function MonthGrid({ start, end, onPick }: { start?: string; end?: string | null; onPick: (iso: string) => void }) {
  const [month, setMonth] = useState(() => {
    const y = Number(start?.slice(0, 4));
    const d = start && y >= 1900 ? new Date(y, Number(start.slice(5, 7)) - 1, 1) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
    return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
  }, [month]);
  const today = isoDay(new Date());
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const a = start?.slice(0, 10), b = end?.slice(0, 10) ?? a;
  return (
    <div className="px-1 pb-1">
      <div className="mb-1 flex items-center">
        <span className="flex-1 text-sm font-medium capitalize">{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</span>
        <button type="button" aria-label="Mês anterior" onClick={() => shift(-1)} className="rounded p-1 hover:bg-[var(--n-hover)]"><ChevronLeft size={14} /></button>
        <button type="button" aria-label="Próximo mês" onClick={() => shift(1)} className="rounded p-1 hover:bg-[var(--n-hover)]"><ChevronRight size={14} /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs">
        {WEEK.map((w, i) => <span key={i} className="py-0.5 text-[var(--n-text-faint)]">{w}</span>)}
        {days.map((d) => {
          const k = isoDay(d);
          const edge = k === a || k === b;
          const inside = a && b && k > a && k < b;
          return (
            <button key={k} type="button" aria-label={toBr(k)} aria-pressed={edge} onClick={() => onPick(k)}
              className={`h-7 rounded ${edge ? "bg-[var(--n-accent)] font-medium text-white" : inside ? "bg-[var(--n-active)]" : "hover:bg-[var(--n-hover)]"} ${d.getMonth() === month.getMonth() ? "" : "text-[var(--n-text-faint)]"} ${k === today && !edge ? "font-semibold text-red-500" : ""}`}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const REMINDERS: { value: string; label: string }[] = [
  { value: "", label: "Sem lembrete" }, { value: "0", label: "No dia" }, { value: "1", label: "1 dia antes" },
  { value: "2", label: "2 dias antes" }, { value: "7", label: "1 semana antes" },
];
const REPEATS: { value: Repeat | ""; label: string }[] = [
  { value: "", label: "Não repete" }, { value: "daily", label: "Todo dia" }, { value: "weekly", label: "Toda semana" }, { value: "monthly", label: "Todo mês" },
];

/** Hora local de um valor salvo, aceitando também o formato ISO com fuso. */
const clock = (s?: string | null) => {
  if (!s || s.length <= 10) return "09:00";
  const d = new Date(s);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dayOf = (s: string) => (s.length <= 10 ? s : isoDay(new Date(s)));

export function DatePicker({ value, onChange, onDone, extras = true }: {
  value: DateValue | null; onChange: (v: DateValue | null) => void; onDone?: () => void; extras?: boolean;
}) {
  const [field, setField] = useState<"start" | "end">("start");
  const hasEnd = Boolean(value?.end);
  const time = Boolean(value?.time);
  const start = value?.start ? dayOf(value.start) : "";
  const end = value?.end ? dayOf(value.end) : "";

  const compose = (day: string, t: string) => (time ? `${day}T${t}` : day);
  const setDay = (key: "start" | "end", day: string) => {
    const base: DateValue = value ?? { start: day };
    const next: DateValue = { ...base, [key]: compose(day, clock(base[key])) };
    // O início nunca fica depois do fim.
    if (next.end && dayOf(next.end) < dayOf(next.start)) {
      if (key === "start") next.end = next.start; else next.start = next.end;
    }
    onChange(next);
  };
  const typed = (key: "start" | "end") => (iso: string) => {
    if (iso) return setDay(key, iso);
    if (key === "end") onChange(value ? { ...value, end: null } : null);
    else onChange(null);
  };
  const pick = (day: string) => {
    setDay(hasEnd ? field : "start", day);
    if (hasEnd && field === "start") setField("end");
    else if (!time) onDone?.();
  };
  const setTime = (key: "start" | "end") => (t: string) => {
    const cur = value?.[key];
    if (cur) onChange({ ...value!, [key]: `${dayOf(cur)}T${t}` });
  };
  const toggleTime = (on: boolean) => {
    const base: DateValue = value ?? { start: addDays(0) };
    const conv = (s?: string | null) => (!s ? s : on ? `${dayOf(s)}T${clock(s)}` : dayOf(s));
    onChange({ ...base, time: on, start: conv(base.start)!, end: conv(base.end) });
  };
  const today = addDays(0);

  return (
    <div className="space-y-1">
      <div className="p-1">
        <div className="flex items-center gap-1">
          <span onFocus={() => setField("start")} className="min-w-0 flex-1">
            <DateText label={hasEnd ? "Início" : "Data"} value={start} onCommit={typed("start")} />
          </span>
          {time && start && <TimeText label="Hora de início" value={clock(value?.start)} onCommit={setTime("start")} />}
        </div>
        {hasEnd && (
          <div className="mt-1 flex items-center gap-1">
            <span onFocus={() => setField("end")} className="min-w-0 flex-1">
              <DateText label="Fim" value={end} onCommit={typed("end")} />
            </span>
            {time && <TimeText label="Hora de fim" value={clock(value?.end)} onCommit={setTime("end")} />}
          </div>
        )}
      </div>
      <div className="flex gap-1 px-1">
        {([["Hoje", 0], ["Amanhã", 1], ["Em 7 dias", 7]] as const).map(([l, n]) => (
          <button key={l} type="button" onClick={() => pick(addDays(n))}
            className="flex-1 rounded border border-[var(--n-border)] px-1 py-0.5 text-xs hover:bg-[var(--n-hover)]">{l}</button>
        ))}
      </div>
      <MonthGrid start={start || today} end={end} onPick={pick} />
      <div className="border-t border-[var(--n-border)] pt-1">
        <label className={menuItem}>
          <input type="checkbox" checked={hasEnd} className="accent-[var(--n-accent)]"
            onChange={(e) => {
              const base: DateValue = value ?? { start: compose(today, "09:00") };
              onChange({ ...base, end: e.target.checked ? base.start : null });
              setField(e.target.checked ? "end" : "start");
            }} /> Data de término
        </label>
        <label className={menuItem}>
          <input type="checkbox" checked={time} className="accent-[var(--n-accent)]" onChange={(e) => toggleTime(e.target.checked)} /> Incluir horário
        </label>
        {extras && value && (
          <div className="flex gap-1 p-1">
            <Choice label="Lembrete" width={150} value={value.remind === undefined || value.remind === null ? "" : String(value.remind)} options={REMINDERS}
              onChange={(r) => onChange({ ...value, remind: r === "" ? null : Number(r) })} />
            <Choice label="Repetir" width={150} value={(value.repeat ?? "") as Repeat | ""} options={REPEATS}
              onChange={(r) => onChange({ ...value, repeat: r || null })} />
          </div>
        )}
        {value && <button type="button" onClick={() => { onChange(null); onDone?.(); }} className={menuItem}><X size={14} /> Limpar</button>}
      </div>
    </div>
  );
}
