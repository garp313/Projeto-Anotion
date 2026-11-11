"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, ChevronLeft, ChevronRight, Copy, GripVertical, Maximize2, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import type { ColumnSchema, DatabaseRow, DatabaseViewConfig, RollupFn } from "./types";
import { DEFAULT_STATUS_OPTIONS, READ_ONLY } from "./types";
import { aggregate, asDate, displayText, dueTone, groupRows, isBlank, isDone, parseDay, rawValue, visibleProps, type Group } from "./values";
import type { Db } from "./useDatabase";
import { PropertyPreview, PropertyValue } from "./cells";
import { AddPropertyMenu, PropertyMenu } from "./PropertyMenu";
import { Choice, CopyIdItem, OptionTag, Pop, PropIcon, menuItem } from "./ui";

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
  if (col.type === "person") return { [col.id]: [g.value ?? { name: g.label }] };
  return { [col.id]: col.type === "multi_select" ? [g.id] : col.type === "checkbox" ? g.label === "Sim" : g.id };
}
const PAGE_SIZE = 100;
const BOARD_PAGE = 30;
const CALENDAR_LIMIT = 3;
const canDropInto = (col?: ColumnSchema) => col && ["select", "status", "multi_select", "person"].includes(col.type);

/** Título em edição logo após criar o cartão: Enter ou clicar fora confirma. */
function QuickTitle({ row, db, onDone, className = "" }: { row: DatabaseRow; db: Db; onDone: () => void; className?: string }) {
  const [text, setText] = useState(row.title);
  const finish = (save: boolean) => {
    const title = db.schema.find((c) => c.type === "title");
    // Esc ou sair sem digitar nada desfaz a criação: antes ficava um "Sem título" no quadro.
    if (!text.trim() && !row.title) void db.discardRow(row.id);
    else if (save && title && text.trim() && text !== row.title) db.setValue(row.id, title.id, text.trim());
    onDone();
  };
  return (
    <input autoFocus value={text} aria-label="Título do novo item" placeholder="Digite um título…"
      onChange={(e) => setText(e.target.value)} onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        if (e.key === "Escape") { e.preventDefault(); finish(false); }
      }}
      className={`w-full min-w-0 rounded border border-[var(--n-accent)] bg-[var(--n-bg)] px-1.5 py-1 text-sm outline-none ${className}`} />
  );
}

/** Área com rolagem lateral: mostra um degradê enquanto houver colunas fora da tela. */
function ScrollArea({ children, className = "", role }: { children: React.ReactNode; className?: string; role?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollLeft = 0;
    const check = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener("scroll", check, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener("scroll", check); };
  }, []);
  return (
    <div className="relative">
      <div ref={ref} role={role} className={`n-scroll overflow-x-auto [overflow-anchor:none] ${className}`}>{children}</div>
      {more && (
        <div data-testid="scroll-hint" className="pointer-events-none absolute inset-y-0 right-0 z-30 flex w-10 items-center justify-end bg-gradient-to-l from-[var(--n-bg)] to-transparent text-[var(--n-text-faint)]">
          <ChevronRight size={16} />
        </div>
      )}
    </div>
  );
}

function RowMenu({ row, db, open }: { row: DatabaseRow; db: Db; open: (id: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <Pop open={show} onOpenChange={setShow} width={190} triggerClass="rounded p-0.5 hover:bg-[var(--n-active)]"
      trigger={<MoreHorizontal size={14} aria-label="Opções da linha" />}>
      <button type="button" className={menuItem} onClick={() => { setShow(false); open(row.id); }}><Maximize2 size={14} /> Abrir</button>
      <button type="button" className={menuItem} onClick={() => { setShow(false); db.duplicateRow(row); }}><Copy size={14} /> Duplicar</button>
      <button type="button" className={menuItem} onClick={() => { setShow(false); void db.saveTemplate(row); }}><BookmarkPlus size={14} /> Salvar como modelo</button>
      <CopyIdItem value={row.id} label="Copiar ID da linha" />
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
      className={`relative flex h-8 shrink-0 items-center border-r border-[var(--n-border)] bg-[var(--n-bg)] text-[var(--n-text-muted)] hover:bg-[var(--n-hover)] ${col.type === "title" ? "sticky left-12 z-20" : ""}`}
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

/** Edição em massa: reaproveita o editor da célula e aplica o valor em todas as linhas marcadas. */
function BulkBar({ db, ids, clear }: { db: Db; ids: string[]; clear: () => void }) {
  const cols = db.schema.filter((c) => c.type !== "title" && !READ_ONLY.includes(c.type) && !["files", "relation", "checklist"].includes(c.type));
  const [colId, setColId] = useState(cols.find((c) => c.type === "status")?.id ?? cols[0]?.id ?? "");
  const col = cols.find((c) => c.id === colId);
  const sample = db.rows.find((r) => r.id === ids[0]);
  const [asking, setAsking] = useState(false);
  const many = { ...db, setValue: (_row: string, prop: string, value: any) => ids.forEach((id) => db.setValue(id, prop, value)) } as Db;
  return (
    <div role="toolbar" aria-label="Ações em massa" className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-[var(--n-border)] bg-[var(--n-hover)]/50 px-2 py-1 text-xs">
      <span className="font-medium">{ids.length} selecionada(s)</span>
      {col && sample && (
        <>
          <span className="text-[var(--n-text-muted)]">Alterar</span>
          <Choice label="Propriedade a alterar" value={colId} options={cols.map((c) => ({ value: c.id, label: c.name }))} onChange={setColId} />
          <span className="text-[var(--n-text-muted)]">para</span>
          <div key={colId} className="w-44 rounded border border-[var(--n-border)] bg-[var(--n-bg)]">
            <PropertyValue col={col} row={{ ...sample, row_properties: {} }} db={many} />
          </div>
        </>
      )}
      {asking ? (
        <span className="ml-auto flex items-center gap-1">
          <span>Excluir {ids.length}?</span>
          <button type="button" className="rounded bg-red-500 px-1.5 py-1 font-medium text-white" onClick={() => { db.removeRows(ids); clear(); }}>Sim, excluir</button>
          <button type="button" className="rounded px-1.5 py-1 hover:bg-[var(--n-hover)]" onClick={() => setAsking(false)}>Cancelar</button>
        </span>
      ) : (
        <button type="button" className="ml-auto flex items-center gap-1 rounded px-1.5 py-1 text-red-500 hover:bg-[var(--n-hover)]" onClick={() => setAsking(true)}><Trash2 size={13} /> Excluir</button>
      )}
      <button type="button" aria-label="Limpar seleção" onClick={clear} className="rounded p-1 hover:bg-[var(--n-hover)]"><X size={13} /></button>
    </div>
  );
}

function CalcCell({ col, db, view, rows, width }: { col: ColumnSchema; db: Db; view: DatabaseViewConfig; rows: DatabaseRow[]; width: number }) {
  const fn = view.calcs?.[col.id];
  const [show, setShow] = useState(false);
  const result = fn ? aggregate(fn, rows.map((r) => rawValue(col, r, db.ctx)), (v) => displayText(col, v, db.ctx)) : null;
  const label = fn ? CALCS.find(([f]) => f === fn)?.[1] : null;
  const text = typeof result === "number" ? result.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : result;
  return (
    <div style={{ width }} className="group/calc shrink-0">
      <Pop open={show} onOpenChange={setShow} width={180} triggerClass="block h-7 w-full truncate px-2 text-right text-xs text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]"
        trigger={fn ? <>{label} <b className="font-medium text-[var(--n-text-muted)]">{text}</b></>
          : col.type === "title" ? <span>{rows.length} {rows.length === 1 ? "item" : "itens"}</span>
          : <span className="opacity-0 group-hover/calc:opacity-100">Calcular</span>}>
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
  const [picked, setPicked] = useState<string[]>([]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [fresh, setFresh] = useState<string | null>(null);
  // Linhas excluídas ou escondidas por um filtro saem da seleção.
  const selected = picked.filter((id) => rows.some((r) => r.id === id));
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
  const newRow = async (props: Record<string, any>) => setFresh((await db.addRow({ row_properties: props })).id);

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
    <div>
    {selected.length > 0 && <BulkBar db={db} ids={selected} clear={() => setPicked([])} />}
    <ScrollArea role="table" className="max-h-[calc(100vh-110px)] overflow-y-auto pb-2">
      <div className="w-max min-w-full">
        <div role="row" className="sticky top-0 z-30 flex border-y border-[var(--n-border)] bg-[var(--n-bg)]">
          <div className="sticky left-0 z-20 flex w-12 shrink-0 items-center justify-end bg-[var(--n-bg)] pr-1.5">
            <input type="checkbox" aria-label="Selecionar todas" className="accent-[var(--n-accent)]"
              checked={rows.length > 0 && selected.length === rows.length}
              onChange={(e) => setPicked(e.target.checked ? rows.map((r) => r.id) : [])} />
          </div>
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
            {g.rows.slice(0, limit).map((row) => (
              <div key={row.id} role="row"
                onDragOver={(e) => e.preventDefault()} onDrop={() => dropRow(row, g.rows)}
                className="group flex border-b border-[var(--n-border)] hover:bg-[var(--n-hover)]/40">
                <div className="sticky left-0 z-10 flex w-12 shrink-0 items-center justify-end gap-0.5 bg-[var(--n-bg)] pr-1.5">
                  <span draggable onDragStart={() => { dragRow.current = row.id; }} aria-label="Arrastar linha"
                    className="cursor-grab text-[var(--n-text-faint)] opacity-0 group-hover:opacity-100"><GripVertical size={14} /></span>
                  <input type="checkbox" aria-label={`Selecionar ${titleOf(row)}`} checked={selected.includes(row.id)}
                    onChange={(e) => toggle(row.id, e.target.checked)}
                    className={`accent-[var(--n-accent)] ${selected.includes(row.id) ? "" : "opacity-0 focus:opacity-100 group-hover:opacity-100"}`} />
                </div>
                {cols.map((c) => (
                  <div key={c.id} role="cell" style={{ width: widthOf(c) }}
                    className={`min-w-0 shrink-0 border-r border-[var(--n-border)] ${c.type === "title" ? "sticky left-12 z-10 bg-[var(--n-bg)]" : "relative"} ${view.wrap ? "" : "max-h-[60px] overflow-hidden"}`}>
                    {c.type === "title" ? (
                      <div className="flex items-center">
                        {row.icon && <span className="pl-2 text-sm">{row.icon}</span>}
                        <PropertyValue col={c} row={row} db={db} autoFocus={row.id === fresh} dense={!view.wrap} />
                        <span className="mr-1 flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                          <button type="button" onClick={() => open(row.id)}
                            className="rounded border border-[var(--n-border)] px-1 text-[11px] text-[var(--n-text-muted)] hover:bg-[var(--n-active)]">Abrir</button>
                          <RowMenu row={row} db={db} open={open} />
                        </span>
                      </div>
                    ) : <PropertyValue col={c} row={row} db={db} dense={!view.wrap} />}
                  </div>
                ))}
              </div>
            ))}
            {g.rows.length > limit && (
              <button type="button" onClick={() => setLimit((n) => n + PAGE_SIZE)} className="flex h-8 w-full items-center border-b border-[var(--n-border)] text-sm text-[var(--n-accent)] hover:bg-[var(--n-hover)]">
                <span className="sticky left-12 pl-12">Carregar mais ({g.rows.length - limit})</span>
              </button>
            )}
            <button type="button" onClick={() => void newRow({ ...defaults, ...groupValue(gcol, g) })}
              className="flex h-8 w-full items-center border-b border-[var(--n-border)] text-sm text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]">
              <span className="sticky left-12 flex items-center gap-1.5 pl-12"><Plus size={14} /> Nova página</span>
            </button>
          </div>
        ))}

        <div className="flex">
          <div className="w-12 shrink-0" />
          {cols.map((c) => <CalcCell key={c.id} col={c} db={db} view={view} rows={rows} width={widthOf(c)} />)}
        </div>
      </div>
    </ScrollArea>
    </div>
  );
}

function Card({ row, db, cols, open, draggable, onDragStart }: {
  row: DatabaseRow; db: Db; cols: ColumnSchema[]; open: (id: string) => void; draggable?: boolean; onDragStart?: (e: React.DragEvent) => void;
}) {
  const shown = cols.filter((c) => c.type !== "title" && !isBlank(rawValue(c, row, db.ctx)));
  return (
    <button type="button" draggable={draggable} onDragStart={onDragStart} onClick={() => open(row.id)}
      className="block w-full overflow-hidden rounded-md border border-[var(--n-border)] bg-[var(--n-bg)] p-2 text-left shadow-sm hover:bg-[var(--n-hover)]">
      <span title={titleOf(row)} className="block truncate text-sm font-medium">{row.icon} {titleOf(row)}</span>
      {shown.length > 0 && (
        <span className="mt-1 flex min-w-0 flex-col items-start gap-1">
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
  const [fresh, setFresh] = useState<string | null>(null);
  const [more, setMore] = useState<Record<string, number>>({});
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
  // Grupos primeiro e "Sem status" por último, só quando tiver algo: "Concluído" não some à direita.
  const all = groupRows(rows, gcol, db.ctx);
  const groups = [...all.filter((g) => g.id !== "__none"), ...all.filter((g) => g.id === "__none" && g.rows.length)]
    .filter((g) => !view.hideEmpty || g.rows.length);

  const drop = (e: React.DragEvent, g: Group) => {
    setOver(null);
    const id = e.dataTransfer.getData("text/row");
    if (!id || !canDropInto(gcol)) return;
    db.setValue(id, gcol.id, g.id === "__none" ? (gcol.type === "multi_select" ? [] : null) : groupValue(gcol, g)[gcol.id]);
  };

  return (
    <ScrollArea>
    <div className="flex w-max min-w-full gap-3 pb-3">
      {groups.map((g) => (
        <section key={g.id} aria-label={g.label}
          onDragOver={(e) => { e.preventDefault(); setOver(g.id); }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, g)}
          className={`w-56 shrink-0 rounded-lg p-1.5 ${over === g.id ? "bg-[var(--n-active)]" : "bg-[var(--n-hover)]/50"}`}>
          <header className="mb-1.5 flex items-center gap-2 px-1 py-0.5">
            {g.color ? <OptionTag option={{ value: g.label, color: g.color }} /> : <span className="text-xs font-medium text-[var(--n-text-muted)]">{g.label}</span>}
            <span className="text-xs text-[var(--n-text-faint)]">{g.rows.length}</span>
          </header>
          <div className="space-y-1.5">
            {g.rows.slice(0, more[g.id] ?? BOARD_PAGE).map((r) => (
              r.id === fresh
                ? <QuickTitle key={r.id} row={r} db={db} onDone={() => setFresh(null)} />
                : <Card key={r.id} row={r} db={db} cols={cols} open={open} draggable onDragStart={(e) => e.dataTransfer.setData("text/row", r.id)} />
            ))}
            {g.rows.length > (more[g.id] ?? BOARD_PAGE) && (
              <button type="button" onClick={() => setMore((m) => ({ ...m, [g.id]: (m[g.id] ?? BOARD_PAGE) + BOARD_PAGE }))}
                className="w-full rounded px-1 py-1 text-left text-xs text-[var(--n-accent)] hover:bg-[var(--n-hover)]">
                Mostrar mais ({g.rows.length - (more[g.id] ?? BOARD_PAGE)})
              </button>
            )}
          </div>
          <button type="button" onClick={async () => setFresh((await db.addRow({ row_properties: { ...defaults, ...groupValue(gcol, g) } })).id)}
            className="mt-1 flex w-full items-center gap-1 rounded px-1 py-1 text-xs text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]">
            <Plus size={13} /> Nova página
          </button>
        </section>
      ))}
    </div>
    </ScrollArea>
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
/** Sem data não há visão: o botão cria a propriedade e já aponta a visão para ela. */
function NoDate({ db, view, kind }: { db: Db; view: DatabaseViewConfig; kind: "calendar" | "timeline" }) {
  return (
    <div className="py-10 text-center">
      <p className="mb-3 text-sm text-[var(--n-text-muted)]">
        {kind === "timeline" ? "A linha do tempo precisa de uma propriedade de Data, com início e fim." : "O calendário precisa de uma propriedade de Data."}
      </p>
      <button type="button"
        onClick={() => { const c = db.addColumn({ name: kind === "timeline" ? "Período" : "Data", type: "date" }); void db.saveView({ ...view, dateProp: c.id }); }}
        className="rounded-md bg-[var(--n-accent)] px-3 py-1.5 text-sm font-medium text-white hover:brightness-95">Criar propriedade de Data</button>
    </div>
  );
}

const SLOP = 6;
const HOLD_MS = 350;

/**
 * Arrastar para um dia com mouse, caneta ou dedo. O arrasto nativo do navegador não funciona no toque;
 * no toque é preciso segurar um instante antes, senão rolar a tela viraria arrasto.
 */
function useDayDrag(onDrop: (id: string, day: string) => void, onTap: (id: string) => void) {
  const [drag, setDrag] = useState<{ id: string; label: string; x: number; y: number } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const holding = useRef(false);
  // O navegador decide no começo do toque se ele pode rolar a tela: o bloqueio precisa já estar registrado.
  useEffect(() => {
    const block = (t: TouchEvent) => { if (holding.current) t.preventDefault(); };
    document.addEventListener("touchmove", block, { passive: false });
    return () => document.removeEventListener("touchmove", block);
  }, []);
  const start = (e: React.PointerEvent, id: string, label: string) => {
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY, touch = e.pointerType !== "mouse";
    let active = false, day: string | null = null, last = { x: x0, y: y0 };
    const dayAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-day]") as HTMLElement | null)?.dataset.day ?? null;
    const begin = () => { active = true; holding.current = true; setDrag({ id, label, x: last.x, y: last.y }); navigator.vibrate?.(10); };
    const timer = touch ? window.setTimeout(begin, HOLD_MS) : 0;
    const stop = () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", stop);
      holding.current = false;
      setDrag(null); setOver(null);
    };
    const move = (m: PointerEvent) => {
      last = { x: m.clientX, y: m.clientY };
      const far = Math.hypot(m.clientX - x0, m.clientY - y0) > SLOP;
      if (!active) {
        // No toque, mexer antes do tempo é rolagem: o navegador cuida.
        if (touch) { if (far) stop(); return; }
        if (!far) return;
        begin();
      }
      day = dayAt(m.clientX, m.clientY);
      setOver(day);
      setDrag({ id, label, x: m.clientX, y: m.clientY });
    };
    const up = () => {
      const moved = Math.hypot(last.x - x0, last.y - y0) > SLOP;
      const wasActive = active;
      stop();
      if (wasActive) { if (day) onDrop(id, day); }
      else if (!moved) onTap(id);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", stop);
  };
  return { drag, over, start };
}

const UNDATED_SHOWN = 50;
const NO_DAY = "none";

export function CalendarView({ db, view, rows, open, defaults }: ViewProps) {
  const col = dateCol(db, view);
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [fresh, setFresh] = useState<string | null>(null);
  const [opened, setOpened] = useState<string[]>([]);
  const [allUndated, setAllUndated] = useState(false);
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
    return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
  }, [month]);
  const moveTo = (id: string, day: string) => {
    const r = rows.find((x) => x.id === id);
    if (!r || !col) return;
    const cur = asDate(rawValue(col, r, db.ctx));
    if (day === NO_DAY) { if (cur) db.setValue(id, col.id, null); return; }
    // Sem data ainda: ganha o dia em que foi solta.
    if (!cur) return db.setValue(id, col.id, { start: day });
    const delta = Math.round((parseDay(day).getTime() - parseDay(cur.start.slice(0, 10)).getTime()) / 86_400_000);
    if (!delta) return;
    const add = (s: string) => { const x = parseDay(s); x.setDate(x.getDate() + delta); return cur.time ? x.toISOString() : iso(x); };
    db.setValue(id, col.id, { ...cur, start: add(cur.start), end: cur.end ? add(cur.end) : cur.end });
  };
  const { drag, over, start } = useDayDrag(moveTo, open);
  if (!col) return <NoDate db={db} view={view} kind="calendar" />;

  const byDay = new Map<string, DatabaseRow[]>();
  const undated: DatabaseRow[] = [];
  for (const r of rows) {
    const d = asDate(rawValue(col, r, db.ctx));
    if (!d) { undated.push(r); continue; }
    const end = d.end ? parseDay(d.end) : parseDay(d.start);
    for (let x = parseDay(d.start), n = 0; x <= end && n < 62; x = new Date(x.getFullYear(), x.getMonth(), x.getDate() + 1), n++) {
      const k = iso(x);
      byDay.set(k, [...(byDay.get(k) ?? []), r]);
    }
  }
  const today = iso(new Date());
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  // Itens arrastáveis: o clique (ou toque) abre; Enter pelo teclado também.
  const item = (r: DatabaseRow) => ({
    onPointerDown: (e: React.PointerEvent) => start(e, r.id, `${r.icon ?? ""} ${titleOf(r)}`.trim()),
    onClick: (e: React.MouseEvent) => { if (e.detail === 0) open(r.id); },
    // Segurar no toque abre o menu do navegador, que cancelaria o arrasto.
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    title: titleOf(r),
  });
  const chip = "cursor-grab select-none [-webkit-touch-callout:none]";

  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        <h3 className="mr-auto text-sm font-semibold">{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h3>
        <button type="button" aria-label="Mês anterior" onClick={() => shift(-1)} className="rounded p-1 hover:bg-[var(--n-hover)]"><ChevronLeft size={15} /></button>
        <button type="button" onClick={() => { const d = new Date(); d.setDate(1); setMonth(d); }} className="rounded px-2 py-0.5 text-xs hover:bg-[var(--n-hover)]">Hoje</button>
        <button type="button" aria-label="Próximo mês" onClick={() => shift(1)} className="rounded p-1 hover:bg-[var(--n-hover)]"><ChevronRight size={15} /></button>
      </div>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
      <div className="min-w-0 flex-1">
      <ScrollArea>
      <div className="grid min-w-[640px] grid-cols-7 border-l border-t border-[var(--n-border)]">
        {WEEKDAYS.map((d) => <div key={d} className="border-b border-r border-[var(--n-border)] px-1.5 py-1 text-right text-xs text-[var(--n-text-faint)]">{d}</div>)}
        {cells.map((d) => {
          const k = iso(d);
          return (
            <div key={k} data-day={k}
              className={`group min-h-24 min-w-0 border-b border-r border-[var(--n-border)] p-1 ${over === k ? "bg-[var(--n-active)]" : ""} ${d.getMonth() === month.getMonth() ? "" : "opacity-40"}`}>
              <div className="flex items-center">
                <button type="button" aria-label={`Nova página em ${k}`} onClick={async () => setFresh((await db.addRow({ row_properties: { ...defaults, [col.id]: { start: k } } })).id)}
                  className="rounded p-0.5 opacity-0 hover:bg-[var(--n-hover)] group-hover:opacity-100"><Plus size={12} /></button>
                <span className={`ml-auto grid h-5 min-w-5 place-items-center rounded-full text-xs ${k === today ? "bg-red-500 text-white" : "text-[var(--n-text-muted)]"}`}>{d.getDate()}</span>
              </div>
              {(byDay.get(k) ?? []).slice(0, opened.includes(k) ? undefined : CALENDAR_LIMIT).map((r) => (
                r.id === fresh
                  ? <QuickTitle key={r.id} row={r} db={db} onDone={() => setFresh(null)} className="mt-0.5 text-xs" />
                  : <button key={r.id} type="button" {...item(r)}
                      className={`${chip} mt-0.5 block w-full truncate rounded border bg-[var(--n-bg)] px-1 py-0.5 text-left text-xs shadow-sm hover:bg-[var(--n-hover)] ${drag?.id === r.id ? "opacity-40" : ""} ${isDone(r, db.schema) ? "border-[var(--n-border)] text-[var(--n-text-faint)] line-through" : /red/.test(dueTone(col, r, db.ctx)) ? "border-red-500/60" : "border-[var(--n-border)]"}`}>
                      {r.icon} {titleOf(r)}
                    </button>
              ))}
              {(byDay.get(k)?.length ?? 0) > CALENDAR_LIMIT && !opened.includes(k) && (
                <button type="button" onClick={() => setOpened((o) => [...o, k])} className="mt-0.5 block w-full rounded px-1 text-left text-xs text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]">
                  +{byDay.get(k)!.length - CALENDAR_LIMIT} mais
                </button>
              )}
            </div>
          );
        })}
      </div>
      </ScrollArea>
      </div>
      {/* Só com itens sem data: aparecer no meio do arrasto encolhia o calendário e o item caía no dia errado. */}
      {undated.length > 0 && (
        // Como no Notion: o que não tem data fica ao lado, pronto para ser arrastado para um dia.
        <aside aria-label="Sem data" data-day={NO_DAY}
          className={`rounded-lg border border-[var(--n-border)] p-1.5 xl:sticky xl:top-2 xl:w-56 xl:shrink-0 ${over === NO_DAY ? "bg-[var(--n-active)]" : ""}`}>
          <p className="mb-1 px-1 text-xs font-medium text-[var(--n-text-muted)]">Sem data <span className="font-normal text-[var(--n-text-faint)]">{undated.length}</span></p>
          <p className="mb-1 px-1 text-[11px] text-[var(--n-text-faint)]">Arraste para um dia do calendário.</p>
          <div className="n-scroll flex max-h-[420px] flex-col gap-1 overflow-y-auto">
            {undated.slice(0, allUndated ? undefined : UNDATED_SHOWN).map((r) => (
              <button key={r.id} type="button" {...item(r)}
                className={`${chip} block w-full truncate rounded border border-[var(--n-border)] bg-[var(--n-bg)] px-1.5 py-1 text-left text-xs shadow-sm hover:bg-[var(--n-hover)] ${drag?.id === r.id ? "opacity-40" : ""}`}>
                {r.icon} {titleOf(r)}
              </button>
            ))}
            {undated.length > UNDATED_SHOWN && !allUndated && (
              <button type="button" onClick={() => setAllUndated(true)} className="rounded px-1 py-0.5 text-left text-xs text-[var(--n-accent)] hover:bg-[var(--n-hover)]">
                Mostrar mais ({undated.length - UNDATED_SHOWN})
              </button>
            )}
          </div>
        </aside>
      )}
      </div>
      {drag && (
        <div aria-hidden style={{ left: drag.x + 8, top: drag.y + 8 }}
          className="pointer-events-none fixed z-50 max-w-48 truncate rounded border border-[var(--n-accent)] bg-[var(--n-bg)] px-1.5 py-0.5 text-xs shadow-lg">
          {drag.label}
        </div>
      )}
    </div>
  );
}

const DAY_W = 36;

export function TimelineView({ db, view, rows, open, defaults }: ViewProps) {
  const col = dateCol(db, view);
  const [origin, setOrigin] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0, 0, 0, 0); return d; });
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);
  if (!col) return <NoDate db={db} view={view} kind="timeline" />;
  const days = Array.from({ length: 60 }, (_, i) => new Date(origin.getFullYear(), origin.getMonth(), origin.getDate() + i));
  const index = (s: string) => Math.round((parseDay(s.slice(0, 10)).getTime() - origin.getTime()) / 86_400_000);
  const today = iso(new Date());
  const allDated = rows.filter((r) => asDate(rawValue(col, r, db.ctx)));
  const undated = rows.filter((r) => !asDate(rawValue(col, r, db.ctx)));
  // Item fora da janela ocupava linha vazia: a tela parecia sem dados, com o conteúdo lá embaixo.
  const inView = (r: DatabaseRow) => {
    const v = asDate(rawValue(col, r, db.ctx))!;
    return index(v.end ?? v.start) >= 0 && index(v.start) < days.length;
  };
  const dated = allDated.filter(inView).sort((a, b) => asDate(rawValue(col, a, db.ctx))!.start.localeCompare(asDate(rawValue(col, b, db.ctx))!.start));
  const earliest = allDated.map((r) => asDate(rawValue(col, r, db.ctx))!.start.slice(0, 10)).sort()[0];

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
        {allDated.length > dated.length && <span className="mr-auto text-xs text-[var(--n-text-faint)]">{allDated.length - dated.length} fora deste período</span>}
        {earliest && <button type="button" onClick={() => setOrigin(parseDay(earliest))} className="rounded px-2 py-0.5 text-xs hover:bg-[var(--n-hover)]">Início</button>}
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
              // A barra começa na borda quando o item vem de antes da janela.
              const s = Math.max(index(v.start), 0), e = Math.min(index(v.end ?? v.start), days.length - 1);
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
