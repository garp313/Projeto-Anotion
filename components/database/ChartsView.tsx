"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Table as TableIcon, X } from "lucide-react";
import { newId } from "./types";
import { Choice } from "./ui";
import type { ViewProps } from "./views";
import { GROUPABLE, chartTitle, defaultCharts, groupBars, kpis, weekly, type Bar, type ChartConfig, type Week } from "@/lib/charts";
import { dueColumn } from "@/lib/automations";
import { todayInBrazil } from "@/lib/scheduledEmail";

const NONE = "__none__";
type Tip = { x: number; y: number; text: string } | null;

function Tile({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "critical" }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--n-border)] p-3">
      <p className="flex items-center gap-1 text-xs text-[var(--n-text-muted)]">
        {tone === "critical" && <AlertTriangle size={12} className="text-[var(--viz-critical)]" aria-hidden />}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-[var(--n-text-faint)]">{sub}</p>}
    </div>
  );
}

function Legend() {
  const dot = (v: string) => <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: `var(${v})` }} aria-hidden />;
  return (
    <span className="flex items-center gap-3 text-xs text-[var(--n-text-muted)]">
      <span className="flex items-center gap-1">{dot("--viz-1")} Em aberto</span>
      <span className="flex items-center gap-1">{dot("--viz-2")} Concluídas</span>
    </span>
  );
}

/** Barras deitadas: uma por valor, com o total escrito na ponta. */
function Bars({ bars, split, onTip }: { bars: Bar[]; split: boolean; onTip: (t: Tip) => void }) {
  const max = Math.max(1, ...bars.map((b) => b.open + b.done));
  return (
    <ul className="space-y-1.5">
      {bars.map((b) => {
        const total = b.open + b.done;
        const text = split ? `${b.label}: ${total} (${b.open} em aberto, ${b.done} concluídas)` : `${b.label}: ${total}`;
        const segs = (split ? [["--viz-1", b.open], ["--viz-2", b.done]] : [["--viz-1", total]]).filter(([, n]) => Number(n) > 0) as [string, number][];
        return (
          <li key={b.label} className="flex items-center gap-2 text-xs"
            onMouseMove={(e) => onTip({ x: e.clientX, y: e.clientY, text })} onMouseLeave={() => onTip(null)}>
            <span className="w-28 shrink-0 truncate text-[var(--n-text-muted)]" title={b.label}>{b.label}</span>
            <span className="flex h-3.5 min-w-0 flex-1 items-center">
              <span className="flex h-full gap-[2px]" style={{ width: `${(total / max) * 100}%` }}>
                {segs.map(([v, n], i) => (
                  <span key={v} className={`h-full ${i === segs.length - 1 ? "rounded-r-[4px]" : ""}`} style={{ flexGrow: n, background: `var(${v})` }} />
                ))}
              </span>
              <span className="ml-1.5 tabular-nums text-[var(--n-text)]">{total}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Colunas por semana. O valor aparece ao passar o mouse e na tabela. */
function Columns({ weeks, onTip }: { weeks: Week[]; onTip: (t: Tip) => void }) {
  const max = Math.max(1, ...weeks.map((w) => w.value));
  return (
    <div>
      <div className="flex h-36 items-end gap-1.5 border-b border-[var(--n-border)]">
        {weeks.map((w) => (
          <div key={w.label} className="flex h-full flex-1 items-end" onMouseMove={(e) => onTip({ x: e.clientX, y: e.clientY, text: `${w.label === "Antes" ? "Antes" : `Semana de ${w.label}`}: ${w.value}` })} onMouseLeave={() => onTip(null)}>
            <div className="mx-auto w-full max-w-[36px] rounded-t-[4px]" style={{ height: w.value ? `max(2px, ${(w.value / max) * 100}%)` : 0, background: "var(--viz-1)" }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {weeks.map((w) => <span key={w.label} className="flex-1 truncate text-center text-[10px] text-[var(--n-text-faint)]">{w.label}</span>)}
      </div>
      <p className="mt-1 text-[11px] text-[var(--n-text-faint)]">Maior semana: {max}</p>
    </div>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-xs">
      <thead><tr>{head.map((h) => <th key={h} className="border-b border-[var(--n-border)] py-1 text-left font-medium text-[var(--n-text-muted)]">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`py-0.5 ${j ? "tabular-nums" : ""}`}>{c}</td>)}</tr>)}</tbody>
    </table>
  );
}

function ChartCard({ config, title, db, rows, today, onRemove, onTip }: {
  config: ChartConfig; title: string; db: ViewProps["db"]; rows: ViewProps["rows"]; today: string; onRemove: () => void; onTip: (t: Tip) => void;
}) {
  const [asTable, setAsTable] = useState(false);
  const col = db.schema.find((c) => c.id === config.col);
  const split = config.kind === "group" && col?.type !== "status";
  const bars = useMemo(() => (config.kind === "group" && config.col ? groupBars(rows, db.schema, config.col) : []), [config, rows, db.schema]);
  const weeks = useMemo(() => (config.kind !== "group" ? weekly(rows, db.schema, config.kind, today) : []), [config, rows, db.schema, today]);
  const missing = config.kind === "group" ? !col : config.kind === "overdue_weeks" && !dueColumn(db.schema);
  const empty = config.kind === "group" ? !bars.length : weeks.every((w) => !w.value);

  return (
    <section aria-label={title} className="min-w-0 rounded-lg border border-[var(--n-border)] p-3">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-medium">{title}</h3>
        {split && !asTable && !empty && <Legend />}
        <button type="button" onClick={() => setAsTable((t) => !t)} aria-label={asTable ? "Ver gráfico" : "Ver tabela"} title={asTable ? "Ver gráfico" : "Ver tabela"}
          className="rounded p-1 text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]">{asTable ? <BarChart3 size={13} /> : <TableIcon size={13} />}</button>
        <button type="button" onClick={onRemove} aria-label={`Remover ${title}`} title="Remover gráfico" className="rounded p-1 text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]"><X size={13} /></button>
      </header>
      {missing ? <p className="text-xs text-[var(--n-text-faint)]">{config.kind === "group" ? "A coluna deste gráfico foi excluída." : "Este banco não tem coluna de prazo."}</p>
        : empty ? <p className="text-xs text-[var(--n-text-faint)]">Nada para mostrar nesta visão.</p>
        : asTable ? (config.kind === "group"
          ? <DataTable head={split ? [col!.name, "Em aberto", "Concluídas", "Total"] : [col!.name, "Total"]}
              rows={bars.map((b) => (split ? [b.label, b.open, b.done, b.open + b.done] : [b.label, b.open + b.done]))} />
          : <DataTable head={["Semana", "Quantidade"]} rows={weeks.map((w) => [w.label, w.value])} />)
        : config.kind === "group" ? <Bars bars={bars} split={split} onTip={onTip} /> : <Columns weeks={weeks} onTip={onTip} />}
    </section>
  );
}

/** Visão "Gráficos": números e gráficos do próprio banco, respeitando os filtros da visão. */
export function ChartsView({ db, view, rows }: ViewProps) {
  const [tip, setTip] = useState<Tip>(null);
  const today = todayInBrazil();
  const charts: ChartConfig[] = view.charts ?? defaultCharts(db.schema);
  const k = kpis(rows, db.schema, today);
  const hasDue = Boolean(dueColumn(db.schema));
  const save = (next: ChartConfig[]) => void db.saveView({ ...view, charts: next });
  const addOptions = [
    { value: NONE, label: "+ Adicionar gráfico" },
    ...db.schema.filter((c) => GROUPABLE.includes(c.type)).map((c) => ({ value: `group:${c.id}`, label: `Por ${c.name.toLowerCase()}` })),
    ...(hasDue ? [{ value: "overdue_weeks", label: "Atrasadas por semana do prazo" }] : []),
    { value: "created_weeks", label: "Criadas por semana" },
  ];

  return (
    <div className="space-y-3 py-2" aria-label="Gráficos">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Total" value={k.total} />
        <Tile label="Em aberto" value={k.open} />
        <Tile label="Concluídas" value={k.done} sub={`${k.pct}% do total`} />
        <Tile label="Atrasadas" value={hasDue ? k.overdue : "—"} sub={hasDue ? "prazo vencido e não concluídas" : "sem coluna de prazo"} tone={hasDue && k.overdue ? "critical" : undefined} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {charts.map((c) => (
          <ChartCard key={c.id} config={c} title={chartTitle(c, db.schema)} db={db} rows={rows} today={today} onTip={setTip}
            onRemove={() => save(charts.filter((x) => x.id !== c.id))} />
        ))}
      </div>
      <Choice label="Adicionar gráfico" width={260} value={NONE} options={addOptions} onChange={(v) => {
        if (v === NONE) return;
        const [kind, col] = v.split(":");
        save([...charts, { id: newId("c_"), kind: kind as ChartConfig["kind"], ...(col ? { col } : {}) }]);
      }} />
      {tip && (
        <div role="tooltip" className="pointer-events-none fixed z-[80] rounded border border-[var(--n-border)] bg-[var(--n-bg)] px-2 py-1 text-xs text-[var(--n-text)] shadow-lg"
          style={{ left: tip.x + 12, top: tip.y + 12 }}>{tip.text}</div>
      )}
    </div>
  );
}
