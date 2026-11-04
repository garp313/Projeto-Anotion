"use client";
import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, GripVertical, Maximize2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import type { ColumnSchema, DatabaseRow, DatabaseViewConfig, RollupFn } from "./types";
import { DEFAULT_STATUS_OPTIONS } from "./types";
import { aggregate, asDate, displayText, groupRows, isBlank, parseDay, rawValue, visibleProps, type Group } from "./values";
import type { Db } from "./useDatabase";
import { PropertyPreview, PropertyValue } from "./cells";
import { AddPropertyMenu, PropertyMenu } from "./PropertyMenu";
import { OptionTag, Pop, PropIcon, menuItem } from "./ui";

export type ViewProps = {
  db: Db;
  view: DatabaseViewConfig;
  rows: DatabaseRow[];
  open: (id: string) => void;
  /** Valores herdados dos filtros ativos, como o Notion faz ao criar uma linha. */
  defaults: Record<string, any>;
};

const groupCol = (db: Db, view: DatabaseViewConfig) => db.schema.find((c) => c.id === view.groupBy);
const titleOf = (r: DatabaseRow) => r.title || "Sem título";

/** Valor da propriedade de agrupamento para uma linha criada/solta naquele grupo. */
function groupValue(col: ColumnSchema | undefined, g: Group): Record<string, any> {
  if (!col || g.id === "__all" || g.id === "__none") return {};
  return { [col.id]: col.type === "multi_select" ? [g.id] : col.type === "checkbox" ? g.label === "Sim" : g.id };
}
const canDropInto = (col?: ColumnSchema) => col && ["select", "status", "multi_select"].includes(col.type);

function RowMenu({ row, db, open }: { row: DatabaseRow; db: Db; open: (id: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <Pop open={show} onOpenChange={setShow} width={190} triggerClass="rounded p-0.5 hover:bg-[var(--n-active)]"
      trigger={<MoreHorizontal size={14} aria-label="Opções da linha" />}>
      <button type="button" className={menuItem} onClick={() => { setShow(false); open(row.id); }}><Maximize2 size={14} /> Abrir</button>
      <button type="button" className={menuItem} onClick={() => { setShow(false); db.duplicateRow(row); }}><Copy size={14} /> Duplicar</button>
      <button type="button" className={`${menuItem} text-red-500`} onClick={() => { setShow(false); db.removeRow(row.id); }}><Trash2 size={14} /> Excluir</button>
    </Pop>
  );
}

function ColumnHeader({ col, db, view, width, onResize, onDrop }: {
  col: ColumnSchema; db: Db; view: DatabaseViewConfig; width: number;
  onResize: (w: number) => void; onDrop: (from: string) => void;
}) {
  const [show, setShow] = useState(false);
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX;
    const move = (m: PointerEvent) => onResize(Math.max(80, width + m.clientX - x0));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div
      role="columnheader" style={{ width }}
      draggable={col.type !== "title"}
      onDragStart={(e) => e.dataTransfer.setData("text/prop", col.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { const from = e.dataTransfer.getData("text/prop"); if (from && from !== col.id) onDrop(from); }}
      className={`relative flex h-8 shrink-0 items-center border-r border-[var(--n-border)] bg-[var(--n-bg)] text-[var(--n-text-muted)] hover:bg-[var(--n-hover)] ${col.type === "title" ? "sticky left-7 z-20" : ""}`}
    >
      <Pop open={show} onOpenChange={setShow} width={280} triggerClass="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2 text-left text-sm"
        trigger={<><PropIcon type={col.type} /><span className="truncate">{col.name}</span></>}>
        <PropertyMenu col={col} db={db} view={view} onClose={() => setShow(false)} />
      </Pop>
      <span role="separator" aria-label={`Redimensionar ${col.name}`} onPointerDown={startResize}
        className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-[var(--n-accent)]/40" />
    </div>
  );
}

const CALCS: [RollupFn | "", string][] = [
  ["", "Nenhum"], ["count", "Contar tudo"], ["count_values", "Contar valores"], ["count_unique", "Contar únicos"], ["empty", "Vazios"],
  ["percent_not_empty", "% preenchidos"], ["sum", "Soma"], ["average", "Média"], ["median", "Mediana"], ["min", "Mínimo"], ["max", "Máximo"],
];

function CalcCell({ col, db, view, rows, width }: { col: ColumnSchema; db: Db; view: DatabaseViewConfig; rows: DatabaseRow[]; width: number }) {
  const fn = view.calcs?.[col.id];
  const [show, setShow] = useState(false);
  const result = fn ? aggregate(fn, rows.map((r) => rawValue(col, r, db.ctx)), (v) => displayText(col, v, db.ctx)) : null;
  const label = fn ? CALCS.find(([f]) => f === fn)?.[1] : null;
  const text = typeof result === "number" ? result.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : result;
  return (
    <div style={{ width }} className="group/calc shrink-0">
      <Pop open={show} onOpenChange={setShow} width={180} triggerClass="block h-7 w-full truncate px-2 text-right text-xs text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]"
        trigger={fn ? <>{label} <b className="font-medium text-[var(--n-text-muted)]">{text}</b></> : <span className="opacity-0 group-hover/calc:opacity-100">Calcular</span>}>
        {CALCS.map(([f, l]) => (
          <button key={f} type="button" className={menuItem}
            onClick={() => {
              const calcs = { ...view.calcs };
              if (f) calcs[col.id] = f; else delete calcs[col.id];
              void db.saveView({ ...view, calcs });
              setShow(false);
            }}>{l}</button>
        ))}
      </Pop>
    </div>
  );
}

export function TableView({ db, view, rows, open, defaults }: ViewProps) {
  const cols = visibleProps(db.schema, view);
  const gcol = groupCol(db, view);
  const groups = groupRows(rows, gcol, db.ctx).filter((g) => g.id !== "__none" || g.rows.length);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [addOpen, setAddOpen] = useState(false);
  const save = useRef<ReturnType<typeof setTimeout>>(undefined);
  const widthOf = (c: ColumnSchema) => widths[c.id] ?? view.widths?.[c.id] ?? (c.type === "title" ? 280 : 180);
  const dragRow = useRef<string | null>(null);

  const resize = (id: string, w: number) => {
    setWidths((s) => ({ ...s, [id]: w }));
    clearTimeout(save.current);
    save.current = setTimeout(() => void db.saveView({ ...view, widths: { ...view.widths, ...widths, [id]: w } }), 400);
  };
  const reorder = (from: string, to: string) => {
    const ids = cols.map((c) => c.id).filter((i) => i !== from);
    ids.splice(ids.indexOf(to), 0, from);
    void db.saveView({ ...view, order: ids });
  };
  /** Solta a linha acima de `target` usando a média das posições vizinhas. */
  const dropRow = (target: DatabaseRow, list: DatabaseRow[]) => {
    const id = dragRow.current;
    dragRow.current = null;
    if (!id || id === target.id || view.sorts.length) return;
    const i = list.findIndex((r) => r.id === target.id);
    const prev = list[i - 1]?.id === id ? list[i - 2] : list[i - 1];
    db.moveRow(id, prev ? (prev.position + target.position) / 2 : target.position - 1000);
  };

  return (
    <div role="table" className="n-scroll overflow-x-auto pb-2">
      <div className="w-max min-w-full">
        <div role="row" className="flex border-y border-[var(--n-border)]">
          <div className="sticky left-0 z-20 w-7 shrink-0 bg-[var(--n-bg)]" />
          {cols.map((c) => (
            <ColumnHeader key={c.id} col={c} db={db} view={view} width={widthOf(c)}
              onResize={(w) => resize(c.id, w)} onDrop={(from) => reorder(from, c.id)} />
          ))}
          <Pop open={addOpen} onOpenChange={setAddOpen} width={230} align="end"
            triggerClass="grid h-8 w-9 shrink-0 place-items-center text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]"
            trigger={<Plus size={15} aria-label="Adicionar propriedade" />}>
            <AddPropertyMenu db={db} onDone={() => setAddOpen(false)} />
          </Pop>
        </div>

        {groups.map((g) => (
          <div key={g.id}>
            {gcol && (
              <div className="mt-3 flex items-center gap-2 px-7 py-1 text-sm">
                {g.color ? <OptionTag option={{ value: g.label, color: g.color }} /> : <span className="font-medium">{g.label}</span>}
                <span className="text-xs text-[var(--n-text-faint)]">{g.rows.length}</span>
              </div>
            )}
            {g.rows.map((row) => (
              <div key={row.id} role="row"
                onDragOver={(e) => e.preventDefault()} onDrop={() => dropRow(row, g.rows)}
                className="group flex border-b border-[var(--n-border)] hover:bg-[var(--n-hover)]/40">
                <div className="sticky left-0 z-10 flex w-7 shrink-0 items-center justify-center bg-[var(--n-bg)]">
                  <span draggable onDragStart={() => { dragRow.current = row.id; }} aria-label="Arrastar linha"
                    className="cursor-grab text-[var(--n-text-faint)] opacity-0 group-hover:opacity-100"><GripVertical size={14} /></span>
                </div>
                {cols.map((c) => (
                  <div key={c.id} role="cell" style={{ width: widthOf(c) }}
                    className={`min-w-0 shrink-0 border-r border-[var(--n-border)] ${c.type === "title" ? "sticky left-7 z-10 bg-[var(--n-bg)]" : "relative"} ${view.wrap ? "" : "max-h-[60px] overflow-hidden"}`}>
                    {c.type === "title" ? (
                      <div className="flex items-center">
                        {row.icon && <span className="pl-2 text-sm">{row.icon}</span>}
                        <PropertyValue col={c} row={row} db={db} />
                        <span className="mr-1 flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                          <button type="button" onClick={() => open(row.id)}
                            className="rounded border border-[var(--n-border)] px-1 text-[11px] text-[var(--n-text-muted)] hover:bg-[var(--n-active)]">Abrir</button>
                          <RowMenu row={row} db={db} open={open} />
                        </span>
                      </div>
                    ) : <PropertyValue col={c} row={row} db={db} />}
                  </div>
                ))}
              </div>
            ))}
            <button type="button" onClick={() => db.addRow({ row_properties: { ...defaults, ...groupValue(gcol, g) } })}
              className="flex h-8 w-full items-center gap-1.5 border-b border-[var(--n-border)] pl-8 text-sm text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]">
              <Plus size={14} /> Nova página
            </button>
          </div>
        ))}

        <div className="flex">
          <div className="w-7 shrink-0" />
          {cols.map((c) => <CalcCell key={c.id} col={c} db={db} view={view} rows={rows} width={widthOf(c)} />)}
        </div>
      </div>
    </div>
  );
}

function Card({ row, db, cols, open, draggable, onDragStart }: {
  row: DatabaseRow; db: Db; cols: ColumnSchema[]; open: (id: string) => void; draggable?: boolean; onDragStart?: (e: React.DragEvent) => void;
}) {
  const shown = cols.filter((c) => c.type !== "title" && !isBlank(rawValue(c, row, db.ctx)));
  return (
    <button type="button" draggable={draggable} onDragStart={onDragStart} onClick={() => open(row.id)}
      className="block w-full rounded-md border border-[var(--n-border)] bg-[var(--n-bg)] p-2 text-left shadow-sm hover:bg-[var(--n-hover)]">
      <span className="block truncate text-sm font-medium">{row.icon} {titleOf(row)}</span>
      {shown.length > 0 && (
        <span className="mt-1 flex flex-col items-start gap-1">
          {shown.map((c) => <PropertyPreview key={c.id} col={c} row={row} db={db} />)}
        </span>
      )}
    </button>
  );
}

export function BoardView({ db, view, rows, open, defaults }: ViewProps) {
  // Sem agrupamento escolhido, usa Status e depois Seleção, como o Notion.
  const gcol = groupCol(db, view) ?? db.schema.find((c) => c.type === "status") ?? db.schema.find((c) => c.type === "select");
  const cols = visibleProps(db.schema, view).filter((c) => c.id !== gcol?.id);
  const [over, setOver] = useState<string | null>(null);
  if (!gcol) {
    return (
      <div className="py-10 text-center">
        <p className="mb-3 text-sm text-[var(--n-text-muted)]">O quadro precisa de uma propriedade Status ou Seleção para montar as colunas.</p>
        <button type="button"
          onClick={() => { const c = db.addColumn({ name: "Status", type: "status", options: DEFAULT_STATUS_OPTIONS }); void db.saveView({ ...view, groupBy: c.id }); }}
          className="rounded-md bg-[var(--n-accent)] px-3 py-1.5 text-sm font-medium text-white hover:brightness-95">Criar propriedade Status</button>
      </div>
    );
  }
  const groups = groupRows(rows, gcol, db.ctx);

  const drop = (e: React.DragEvent, g: Group) => {
    setOver(null);
    const id = e.dataTransfer.getData("text/row");
    if (!id || !canDropInto(gcol)) return;
    db.setValue(id, gcol.id, g.id === "__none" ? (gcol.type === "multi_select" ? [] : null) : groupValue(gcol, g)[gcol.id]);
  };

  return (
    <div className="n-scroll flex gap-3 overflow-x-auto pb-3">
      {groups.map((g) => (
        <section key={g.id} aria-label={g.label}
          onDragOver={(e) => { e.preventDefault(); setOver(g.id); }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, g)}
          className={`w-64 shrink-0 rounded-lg p-1.5 ${over === g.id ? "bg-[var(--n-active)]" : "bg-[var(--n-hover)]/50"}`}>
          <header className="mb-1.5 flex items-center gap-2 px-1 py-0.5">
            {g.color ? <OptionTag option={{ value: g.label, color: g.color }} /> : <span className="text-xs font-medium text-[var(--n-text-muted)]">{g.label}</span>}
            <span className="text-xs text-[var(--n-text-faint)]">{g.rows.length}</span>
          </header>
          <div className="space-y-1.5">
            {g.rows.map((r) => (
              <Card key={r.id} row={r} db={db} cols={cols} open={open} draggable onDragStart={(e) => e.dataTransfer.setData("text/row", r.id)} />
            ))}
          </div>
          <button type="button" onClick={() => db.addRow({ row_properties: { ...defaults, ...groupValue(gcol, g) } })}
            className="mt-1 flex w-full items-center gap-1 rounded px-1 py-1 text-xs text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]">
            <Plus size={13} /> Nova página
          </button>
        </section>
      ))}
    </div>
  );
}

export function ListView({ db, view, rows, open, defaults }: ViewProps) {
  const cols = visibleProps(db.schema, view).filter((c) => c.type !== "title");
  const gcol = groupCol(db, view);
  const groups = groupRows(rows, gcol, db.ctx).filter((g) => g.id !== "__none" || g.rows.length);
  return (
    <div>
      {groups.map((g) => (
        <div key={g.id}>
          {gcol && <p className="mt-3 px-2 text-xs font-medium text-[var(--n-text-muted)]">{g.label} · {g.rows.length}</p>}
          {g.rows.map((r) => (
            <div key={r.id} className="group flex items-center gap-3 rounded px-2 py-1 hover:bg-[var(--n-hover)]">
              <button type="button" onClick={() => open(r.id)} className="min-w-0 flex-1 truncate text-left text-sm">{r.icon ?? "📄"} {titleOf(r)}</button>
              <span className="flex min-w-0 items-center gap-3">
                {cols.map((c) => <PropertyPreview key={c.id} col={c} row={r} db={db} />)}
              </span>
              <span className="opacity-0 group-hover:opacity-100"><RowMenu row={r} db={db} open={open} /></span>
            </div>
          ))}
        </div>
      ))}
      <button type="button" onClick={() => db.addRow({ row_properties: defaults })}
        className="mt-1 flex items-center gap-1.5 rounded px-2 py-1 text-sm text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]">
        <Plus size={14} /> Nova página
      </button>
    </div>
  );
}

const GALLERY: Record<NonNullable<DatabaseViewConfig["cardSize"]>, string> = {
  small: "grid-cols-[repeat(auto-fill,minmax(160px,1fr))]",
  medium: "grid-cols-[repeat(auto-fill,minmax(230px,1fr))]",
  large: "grid-cols-[repeat(auto-fill,minmax(320px,1fr))]",
};

export function GalleryView({ db, view, rows, open, defaults }: ViewProps) {
  const cols = visibleProps(db.schema, view).filter((c) => c.type !== "title");
  return (
    <div className={`grid gap-3 ${GALLERY[view.cardSize ?? "medium"]}`}>
      {rows.map((r) => (
        <button key={r.id} type="button" onClick={() => open(r.id)}
          className="overflow-hidden rounded-lg border border-[var(--n-border)] text-left shadow-sm hover:bg-[var(--n-hover)]">
          <span className="block h-28 bg-[var(--n-callout)]" style={r.cover ? { background: r.cover } : undefined} />
          <span className="block p-2">
            <span className="block truncate text-sm font-medium">{r.icon} {titleOf(r)}</span>
            <span className="mt-1 flex flex-col items-start gap-1">
              {cols.map((c) => <PropertyPreview key={c.id} col={c} row={r} db={db} />)}
            </span>
          </span>
        </button>
      ))}
      <button type="button" onClick={() => db.addRow({ row_properties: defaults })}
        className="grid min-h-40 place-items-center rounded-lg border border-dashed border-[var(--n-border)] text-sm text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]">
        <span className="flex items-center gap-1"><Plus size={14} /> Nova página</span>
      </button>
    </div>
  );
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const dateCol = (db: Db, view: DatabaseViewConfig) => db.schema.find((c) => c.id === view.dateProp) ?? db.schema.find((c) => c.type === "date");
const NoDate = () => <p className="py-10 text-center text-sm text-[var(--n-text-faint)]">Adicione uma propriedade de Data para usar esta visão.</p>;

export function CalendarView({ db, view, rows, open, defaults }: ViewProps) {
  const col = dateCol(db, view);
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
    return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
  }, [month]);
  if (!col) return <NoDate />;

  const byDay = new Map<string, DatabaseRow[]>();
  for (const r of rows) {
    const d = asDate(rawValue(col, r, db.ctx));
    if (!d) continue;
    const end = d.end ? parseDay(d.end) : parseDay(d.start);
    for (let x = parseDay(d.start), n = 0; x <= end && n < 62; x = new Date(x.getFullYear(), x.getMonth(), x.getDate() + 1), n++) {
      const k = iso(x);
      byDay.set(k, [...(byDay.get(k) ?? []), r]);
    }
  }
  const today = iso(new Date());
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const moveTo = (id: string, day: string) => {
    const r = rows.find((x) => x.id === id);
    const cur = r && asDate(rawValue(col, r, db.ctx));
    if (!cur) return;
    const delta = Math.round((parseDay(day).getTime() - parseDay(cur.start.slice(0, 10)).getTime()) / 86_400_000);
    const add = (s: string) => { const x = parseDay(s); x.setDate(x.getDate() + delta); return cur.time ? x.toISOString() : iso(x); };
    db.setValue(id, col.id, { ...cur, start: add(cur.start), end: cur.end ? add(cur.end) : cur.end });
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        <h3 className="mr-auto text-sm font-semibold">{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h3>
        <button type="button" aria-label="Mês anterior" onClick={() => shift(-1)} className="rounded p-1 hover:bg-[var(--n-hover)]"><ChevronLeft size={15} /></button>
        <button type="button" onClick={() => { const d = new Date(); d.setDate(1); setMonth(d); }} className="rounded px-2 py-0.5 text-xs hover:bg-[var(--n-hover)]">Hoje</button>
        <button type="button" aria-label="Próximo mês" onClick={() => shift(1)} className="rounded p-1 hover:bg-[var(--n-hover)]"><ChevronRight size={15} /></button>
      </div>
      <div className="grid grid-cols-7 border-l border-t border-[var(--n-border)]">
        {WEEKDAYS.map((d) => <div key={d} className="border-b border-r border-[var(--n-border)] px-1.5 py-1 text-right text-xs text-[var(--n-text-faint)]">{d}</div>)}
        {cells.map((d) => {
          const k = iso(d);
          return (
            <div key={k} onDragOver={(e) => e.preventDefault()} onDrop={(e) => moveTo(e.dataTransfer.getData("text/row"), k)}
              className={`group min-h-24 min-w-0 border-b border-r border-[var(--n-border)] p-1 ${d.getMonth() === month.getMonth() ? "" : "opacity-40"}`}>
              <div className="flex items-center">
                <button type="button" aria-label={`Nova página em ${k}`} onClick={() => db.addRow({ row_properties: { ...defaults, [col.id]: { start: k } } })}
                  className="rounded p-0.5 opacity-0 hover:bg-[var(--n-hover)] group-hover:opacity-100"><Plus size={12} /></button>
                <span className={`ml-auto grid h-5 min-w-5 place-items-center rounded-full text-xs ${k === today ? "bg-red-500 text-white" : "text-[var(--n-text-muted)]"}`}>{d.getDate()}</span>
              </div>
              {(byDay.get(k) ?? []).map((r) => (
                <button key={r.id} type="button" draggable onDragStart={(e) => e.dataTransfer.setData("text/row", r.id)} onClick={() => open(r.id)}
                  className="mt-0.5 block w-full truncate rounded border border-[var(--n-border)] bg-[var(--n-bg)] px-1 py-0.5 text-left text-xs shadow-sm hover:bg-[var(--n-hover)]">
                  {r.icon} {titleOf(r)}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DAY_W = 36;

export function TimelineView({ db, view, rows, open, defaults }: ViewProps) {
  const col = dateCol(db, view);
  const [origin, setOrigin] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0, 0, 0, 0); return d; });
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);
  if (!col) return <NoDate />;
  const days = Array.from({ length: 60 }, (_, i) => new Date(origin.getFullYear(), origin.getMonth(), origin.getDate() + i));
  const index = (s: string) => Math.round((parseDay(s.slice(0, 10)).getTime() - origin.getTime()) / 86_400_000);
  const today = iso(new Date());
  const dated = rows.filter((r) => asDate(rawValue(col, r, db.ctx)));
  const undated = rows.filter((r) => !asDate(rawValue(col, r, db.ctx)));

  const startDrag = (e: React.PointerEvent, r: DatabaseRow) => {
    const x0 = e.clientX;
    const cur = asDate(rawValue(col, r, db.ctx))!;
    let dx = 0;
    const move = (m: PointerEvent) => { dx = m.clientX - x0; setDrag({ id: r.id, dx }); };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      const delta = Math.round(dx / DAY_W);
      if (Math.abs(dx) < 4) return open(r.id);
      if (!delta) return;
      const add = (s: string) => { const x = parseDay(s); x.setDate(x.getDate() + delta); return cur.time ? x.toISOString() : iso(x); };
      db.setValue(r.id, col.id, { ...cur, start: add(cur.start), end: cur.end ? add(cur.end) : cur.end });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const shift = (n: number) => setOrigin((o) => new Date(o.getFullYear(), o.getMonth(), o.getDate() + n));

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-1">
        <button type="button" aria-label="Voltar 30 dias" onClick={() => shift(-30)} className="rounded p-1 hover:bg-[var(--n-hover)]"><ChevronLeft size={15} /></button>
        <button type="button" onClick={() => { const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0, 0, 0, 0); setOrigin(d); }} className="rounded px-2 py-0.5 text-xs hover:bg-[var(--n-hover)]">Hoje</button>
        <button type="button" aria-label="Avançar 30 dias" onClick={() => shift(30)} className="rounded p-1 hover:bg-[var(--n-hover)]"><ChevronRight size={15} /></button>
      </div>
      <div className="n-scroll overflow-x-auto border-y border-[var(--n-border)]">
        <div style={{ width: days.length * DAY_W }}>
          <div className="flex border-b border-[var(--n-border)]">
            {days.map((d) => (
              <div key={iso(d)} style={{ width: DAY_W }} className={`shrink-0 py-1 text-center text-[10px] ${iso(d) === today ? "font-bold text-red-500" : "text-[var(--n-text-faint)]"}`}>
                {d.getDate() === 1 || iso(d) === iso(days[0]) ? <span className="block">{d.toLocaleDateString("pt-BR", { month: "short" })}</span> : <span className="block">&nbsp;</span>}
                {d.getDate()}
              </div>
            ))}
          </div>
          <div className="relative py-1" style={{ minHeight: 120 }}>
            {days.map((d, i) => iso(d) === today && <span key="today" style={{ left: i * DAY_W + DAY_W / 2 }} className="absolute inset-y-0 w-px bg-red-500/60" />)}
            {dated.map((r) => {
              const v = asDate(rawValue(col, r, db.ctx))!;
              const s = index(v.start), e = index(v.end ?? v.start);
              const off = drag?.id === r.id ? drag.dx : 0;
              return (
                <div key={r.id} className="relative h-8">
                  <button type="button" onPointerDown={(ev) => startDrag(ev, r)} title={titleOf(r)}
                    style={{ left: s * DAY_W + off, width: (e - s + 1) * DAY_W }}
                    className="absolute top-1 h-6 cursor-grab touch-none truncate rounded border border-[var(--n-border)] bg-[var(--n-callout)] px-1.5 text-left text-xs shadow-sm hover:brightness-95">
                    {r.icon} {titleOf(r)}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {undated.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-[var(--n-text-faint)]">Sem data ({undated.length})</p>
          {undated.map((r) => <button key={r.id} type="button" onClick={() => open(r.id)} className="mr-2 text-xs underline">{titleOf(r)}</button>)}
        </div>
      )}
      <button type="button" onClick={() => db.addRow({ row_properties: { ...defaults, [col.id]: { start: today } } })}
        className="mt-2 flex items-center gap-1 rounded px-2 py-1 text-sm text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]">
        <Plus size={14} /> Nova página
      </button>
    </div>
  );
}
