"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowUpDown, Calendar, ChevronDown, Columns3, Copy, Download, Eye, EyeOff, Filter as FilterIcon, GalleryHorizontalEnd, GanttChart, Kanban, Layers,
  List, Maximize2, MoreHorizontal, Pencil, Plus, Search, SlidersHorizontal, Table, Trash2, Upload, X,
} from "lucide-react";
import type { DatabaseRow, DatabaseViewConfig, Filter, FilterOp, ViewType } from "./types";
import { VIEW_LABEL, defaultView, newId } from "./types";
import { OP_LABEL, applyView, opNeedsValue, opsFor, visibleProps } from "./values";
import { downloadCsv, parseCsv, planImport, toCsv } from "./csv";
import { useDatabase, type Db } from "./useDatabase";
import { BoardView, CalendarView, GalleryView, ListView, TableView, TimelineView } from "./views";
import { Choice, Pop, PropIcon, fieldClass, menuItem, toolbarBtn } from "./ui";
import { DateText } from "./DatePicker";

const PageView = dynamic(() => import("@/components/editor/PageView").then((m) => m.PageView), { ssr: false });

const VIEW_ICON: Record<ViewType, typeof Table> = {
  table: Table, board: Kanban, list: List, gallery: GalleryHorizontalEnd, calendar: Calendar, timeline: GanttChart,
};
const VIEWS = { table: TableView, board: BoardView, list: ListView, gallery: GalleryView, calendar: CalendarView, timeline: TimelineView };
const selectClass = "rounded border border-[var(--n-border)] bg-[var(--n-bg)] px-1 py-0.5 text-xs outline-none";

function ViewTab({ view, active, db, onPick, onRemoved }: {
  view: DatabaseViewConfig; active: boolean; db: Db; onPick: () => void; onRemoved: () => void;
}) {
  const Icon = VIEW_ICON[view.type];
  const [menu, setMenu] = useState(false);
  const duplicate = () => {
    void db.setViews([...db.views, { ...view, id: newId("v_"), name: `${view.name} (cópia)` }]);
    setMenu(false);
  };
  return (
    <div className={`flex items-center border-b-2 ${active ? "border-[var(--n-text)]" : "border-transparent"}`}>
      <button type="button" onClick={onPick}
        className={`flex items-center gap-1.5 px-2 py-1.5 text-sm ${active ? "font-medium" : "text-[var(--n-text-muted)]"}`}>
        <Icon size={14} /> {view.name}
      </button>
      {active && (
        <Pop open={menu} onOpenChange={setMenu} width={220} triggerClass="rounded p-0.5 text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]"
          trigger={<Pencil size={11} aria-label="Editar visão" />}>
          <div className="p-1">
            <input aria-label="Nome da visão" defaultValue={view.name} className={fieldClass}
              onBlur={(e) => e.target.value.trim() && void db.saveView({ ...view, name: e.target.value.trim() })} />
          </div>
          <p className="px-2 pt-1 text-[11px] text-[var(--n-text-faint)]">Layout</p>
          {(Object.keys(VIEW_LABEL) as ViewType[]).map((t) => {
            const I = VIEW_ICON[t];
            const groupBy = t === "board" && !view.groupBy ? defaultView("board", db.schema).groupBy : view.groupBy;
            return (
              <button key={t} type="button" className={menuItem} onClick={() => void db.saveView({ ...view, type: t, groupBy })}>
                <I size={14} /> {VIEW_LABEL[t]}{t === view.type && " ✓"}
              </button>
            );
          })}
          <div className="my-1 border-t border-[var(--n-border)]" />
          <button type="button" className={menuItem} onClick={duplicate}><Copy size={14} /> Duplicar visão</button>
          {db.views.length > 1 && (
            <button type="button" className={`${menuItem} text-red-500`}
              onClick={() => { void db.setViews(db.views.filter((v) => v.id !== view.id)); onRemoved(); }}>
              <Trash2 size={14} /> Excluir visão
            </button>
          )}
        </Pop>
      )}
    </div>
  );
}

/** Rascunho local: gravar a cada tecla perdia letras e disparava uma requisição por caractere. */
function DraftInput({ value, onCommit, ...rest }: { value: string; onCommit: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value">) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(onCommit);
  latest.current = onCommit;
  useEffect(() => () => clearTimeout(timer.current), []);
  const commit = (v: string) => { clearTimeout(timer.current); if (v !== value) latest.current(v); };
  return (
    <input {...rest} value={draft} onBlur={() => commit(draft)}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => latest.current(v), 250);
      }} />
  );
}

function FilterValue({ f, db, onChange }: { f: Filter; db: Db; onChange: (v: any) => void }) {
  const col = db.schema.find((c) => c.id === f.prop);
  if (!col || !opNeedsValue(f.op)) return null;
  if (col.type === "select" || col.type === "status") {
    return <Choice label="Valor" value={f.value ?? ""} onChange={onChange} options={(col.options ?? []).map((o) => ({ value: o.id, label: o.value }))} />;
  }
  if (["date", "created_time", "last_edited_time"].includes(col.type)) {
    return <span className="w-28"><DateText key={f.prop} label="Valor" value={f.value ?? ""} onCommit={onChange}
      className="w-full rounded border border-[var(--n-border)] bg-transparent px-1.5 py-1 text-xs outline-none focus:border-[var(--n-accent)]" /></span>;
  }
  const isNum = col.type === "number" || col.type === "unique_id";
  return (
    <DraftInput key={f.prop} aria-label="Valor" type={isNum ? "number" : "text"} value={f.value ?? ""}
      onCommit={onChange} placeholder="Valor"
      className="w-28 min-w-0 rounded border border-[var(--n-border)] bg-transparent px-1.5 py-1 text-xs outline-none focus:border-[var(--n-accent)]" />
  );
}

/** Regras de filtro num popover: abrir não desloca a tabela. */
function FilterMenu({ view, db }: { view: DatabaseViewConfig; db: Db }) {
  const patch = (id: string, p: Partial<Filter>) =>
    void db.saveView({ ...view, filters: view.filters.map((f) => (f.id === id ? { ...f, ...p } : f)) });
  const add = () => {
    const c = db.schema[0];
    void db.saveView({ ...view, filters: [...view.filters, { id: newId("f_"), prop: c.id, op: opsFor(c.type)[0], value: "" }] });
  };
  const props = db.schema.map((c) => ({ value: c.id, label: c.name }));
  return (
    <div className="p-1">
      {view.filters.map((f, i) => (
        <div key={f.id} className="mb-1 flex flex-wrap items-center gap-1 text-xs">
          <span className="w-12 shrink-0">
            {i === 0 ? <span className="px-1 text-[var(--n-text-muted)]">Onde</span>
              : i === 1 ? <Choice label="Combinação" width={90} value={view.filterMode} onChange={(filterMode) => void db.saveView({ ...view, filterMode })}
                  options={[{ value: "and", label: "E" }, { value: "or", label: "Ou" }]} />
              : <span className="px-1 text-[var(--n-text-muted)]">{view.filterMode === "and" ? "E" : "Ou"}</span>}
          </span>
          <Choice label="Propriedade" value={f.prop} options={props}
            onChange={(id) => { const c = db.schema.find((x) => x.id === id)!; patch(f.id, { prop: id, op: opsFor(c.type)[0], value: "" }); }} />
          <Choice label="Condição" value={f.op} onChange={(op: FilterOp) => patch(f.id, { op })}
            options={opsFor(db.schema.find((c) => c.id === f.prop)?.type ?? "text").map((o) => ({ value: o, label: OP_LABEL[o] }))} />
          <FilterValue f={f} db={db} onChange={(value) => patch(f.id, { value })} />
          <button type="button" aria-label="Remover filtro" className="ml-auto rounded p-1 hover:bg-[var(--n-hover)]"
            onClick={() => void db.saveView({ ...view, filters: view.filters.filter((x) => x.id !== f.id) })}><X size={12} /></button>
        </div>
      ))}
      <button type="button" onClick={add} className={menuItem}><Plus size={14} /> Adicionar filtro</button>
    </div>
  );
}

function SortMenu({ view, db }: { view: DatabaseViewConfig; db: Db }) {
  const free = db.schema.find((c) => !view.sorts.some((s) => s.prop === c.id));
  const setAt = (i: number, p: Partial<DatabaseViewConfig["sorts"][number]>) =>
    void db.saveView({ ...view, sorts: view.sorts.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <div className="p-1">
      {view.sorts.map((s, i) => (
        <div key={s.prop} className="mb-1 flex items-center gap-1 text-xs">
          <Choice label="Ordenar por" value={s.prop} options={db.schema.map((c) => ({ value: c.id, label: c.name }))} onChange={(prop) => setAt(i, { prop })} />
          <Choice label="Direção" width={130} value={s.dir} onChange={(dir) => setAt(i, { dir })}
            options={[{ value: "asc", label: "Crescente" }, { value: "desc", label: "Decrescente" }]} />
          <button type="button" aria-label="Remover ordenação" className="ml-auto rounded p-1 hover:bg-[var(--n-hover)]"
            onClick={() => void db.saveView({ ...view, sorts: view.sorts.filter((_, j) => j !== i) })}><X size={12} /></button>
        </div>
      ))}
      {free && (
        <button type="button" className={menuItem} onClick={() => void db.saveView({ ...view, sorts: [...view.sorts, { prop: free.id, dir: "asc" }] })}>
          <Plus size={14} /> Adicionar ordenação
        </button>
      )}
    </div>
  );
}

/** Visões prontas para acompanhar demandas: criam a aba já com filtro ou agrupamento. */
function presetsFor(db: Db) {
  const status = db.schema.find((c) => c.type === "status");
  const person = db.schema.find((c) => c.type === "person");
  const date = db.schema.find((c) => /prazo|venc|entrega/i.test(c.name) && c.type === "date") ?? db.schema.find((c) => c.type === "date");
  const filter = (prop: string, op: FilterOp): Filter[] => [{ id: newId("f_"), prop, op }];
  const make = (type: ViewType, name: string, extra: Partial<DatabaseViewConfig>) => ({ ...defaultView(type, db.schema), name, ...extra });
  return [
    status && { label: "Por status", view: () => make("board", "Por status", { groupBy: status.id }) },
    person && { label: "Por responsável", view: () => make("board", "Por responsável", { groupBy: person.id }) },
    person && { label: "Minhas", view: () => make("table", "Minhas", { filters: filter(person.id, "is_me") }) },
    date && { label: "Atrasadas", view: () => make("table", "Atrasadas", { filters: filter(date.id, "overdue") }) },
    date && { label: "Esta semana", view: () => make("table", "Esta semana", { filters: filter(date.id, "this_week") }) },
    date && { label: "Próximos 7 dias", view: () => make("table", "Próximos 7 dias", { filters: filter(date.id, "next_7") }) },
  ].filter((p) => !!p);
}

function DataMenu({ db, view, rows }: { db: Db; view: DatabaseViewConfig; rows: DatabaseRow[] }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const importFile = async (f?: File) => {
    if (!f) return;
    try {
      const table = parseCsv(await f.text());
      if (table.length < 2) return setNote("O arquivo não tem linhas para importar.");
      const plan = planImport(table, db.schema);
      await db.importRows(plan.schema, plan.rows);
      setNote(`${plan.rows.length} linha(s) importada(s).`);
    } catch { setNote("Não foi possível importar o arquivo."); }
  };
  return (
    <Pop open={open} onOpenChange={(o) => { setOpen(o); if (o) setNote(null); }} width={230} align="end" triggerClass={toolbarBtn}
      trigger={<MoreHorizontal size={13} aria-label="Mais ações do banco" />}>
      <button type="button" className={menuItem} onClick={() => { downloadCsv(db.page?.title ?? "banco", toCsv(rows, visibleProps(db.schema, view), db.ctx)); setOpen(false); }}>
        <Download size={14} /> Exportar CSV (esta visão)
      </button>
      <button type="button" className={menuItem} onClick={() => file.current?.click()}><Upload size={14} /> Importar CSV</button>
      {db.schema.some((c) => c.type === "date") && <p className="px-2 pb-0.5 pt-2 text-[11px] text-[var(--n-text-faint)]">Sincronizar com o Google Agenda</p>}
      {db.schema.filter((c) => c.type === "date").map((c) => {
        const on = db.page?.row_properties?.__calendarSync === c.id;
        return (
          <label key={c.id} className={menuItem}>
            <input type="checkbox" checked={on} className="accent-[var(--n-accent)]" onChange={() => void db.setCalendarSync(on ? null : c.id)} />
            <span className="truncate">{c.name}</span>
          </label>
        );
      })}
      <input ref={file} type="file" accept=".csv,text/csv" hidden aria-label="Arquivo CSV" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ""; }} />
      {note && <p role="status" className="px-2 py-1 text-xs text-[var(--n-text-muted)]">{note}</p>}
    </Pop>
  );
}

function NewMenu({ db, defaults, onCreated }: { db: Db; defaults: Record<string, any>; onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Pop open={open} onOpenChange={setOpen} width={230} align="end" triggerClass="flex items-center rounded-r bg-[var(--n-accent)] px-1 py-1 text-white hover:brightness-95"
      trigger={<ChevronDown size={13} aria-label="Modelos" />}>
      <p className="px-2 py-1 text-[11px] text-[var(--n-text-faint)]">Modelos</p>
      {db.templates.map((t) => (
        <div key={t.id} className="flex items-center gap-1">
          <button type="button" className={`${menuItem} min-w-0 flex-1`}
            onClick={async () => {
              setOpen(false);
              const { id: _id, name: _name, ...init } = t;
              onCreated((await db.addRow({ ...init, row_properties: { ...init.row_properties, ...defaults } })).id);
            }}>
            <span className="truncate">{t.icon} {t.name}</span>
          </button>
          <button type="button" aria-label={`Excluir modelo ${t.name}`} onClick={() => void db.setTemplates(db.templates.filter((x) => x.id !== t.id))}
            className="rounded p-1 hover:bg-[var(--n-hover)]"><X size={13} /></button>
        </div>
      ))}
      {!db.templates.length && <p className="px-2 py-1 text-xs text-[var(--n-text-muted)]">Nenhum modelo ainda. No menu “…” de uma linha, use “Salvar como modelo”.</p>}
    </Pop>
  );
}

function Toolbar({ view, db, rows, search, setSearch, onNew, defaults, onCreated }: {
  view: DatabaseViewConfig; db: Db; rows: DatabaseRow[]; search: string; setSearch: (s: string) => void; onNew: () => void;
  defaults: Record<string, any>; onCreated: (id: string) => void;
}) {
  const [searching, setSearching] = useState(false);
  const active = "text-[var(--n-accent)]";
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <Pop width={480} align="end" triggerClass={`${toolbarBtn} ${view.filters.length ? active : ""}`}
        trigger={<><FilterIcon size={13} /> Filtrar{view.filters.length ? ` (${view.filters.length})` : ""}</>}>
        <FilterMenu view={view} db={db} />
      </Pop>
      <Pop width={340} align="end" triggerClass={`${toolbarBtn} ${view.sorts.length ? active : ""}`}
        trigger={<><ArrowUpDown size={13} /> Ordenar{view.sorts.length ? ` (${view.sorts.length})` : ""}</>}>
        <SortMenu view={view} db={db} />
      </Pop>
      <Pop width={220} align="end" triggerClass={`${toolbarBtn} ${view.groupBy ? active : ""}`} trigger={<><Layers size={13} /> Agrupar</>}>
        {view.type !== "board" && <button type="button" className={menuItem} onClick={() => void db.saveView({ ...view, groupBy: null })}>Nenhum</button>}
        {db.schema.filter((c) => ["select", "status", "multi_select", "person", "checkbox", "text", "date"].includes(c.type)).map((c) => (
          <button key={c.id} type="button" className={menuItem} onClick={() => void db.saveView({ ...view, groupBy: c.id })}>
            <PropIcon type={c.type} /> {c.name}{view.groupBy === c.id && " ✓"}
          </button>
        ))}
      </Pop>
      <Pop width={240} align="end" triggerClass={toolbarBtn} trigger={<><SlidersHorizontal size={13} /> Propriedades</>}>
        {db.schema.filter((c) => c.type !== "title").map((c) => {
          const hidden = view.hidden.includes(c.id);
          return (
            <button key={c.id} type="button" className={menuItem}
              onClick={() => void db.saveView({ ...view, hidden: hidden ? view.hidden.filter((h) => h !== c.id) : [...view.hidden, c.id] })}>
              <PropIcon type={c.type} /> <span className="truncate">{c.name}</span>
              <span className="ml-auto text-[var(--n-text-faint)]">{hidden ? <EyeOff size={14} /> : <Eye size={14} />}</span>
            </button>
          );
        })}
        {view.type === "table" && (
          <label className={menuItem}>
            <input type="checkbox" checked={Boolean(view.wrap)} className="accent-[var(--n-accent)]"
              onChange={(e) => void db.saveView({ ...view, wrap: e.target.checked })} /> Quebrar conteúdo das células
          </label>
        )}
        {view.type === "gallery" && (["small", "medium", "large"] as const).map((s) => (
          <button key={s} type="button" className={menuItem} onClick={() => void db.saveView({ ...view, cardSize: s })}>
            <Columns3 size={14} /> Cartão {{ small: "pequeno", medium: "médio", large: "grande" }[s]}{(view.cardSize ?? "medium") === s && " ✓"}
          </button>
        ))}
        {(view.type === "calendar" || view.type === "timeline") && db.schema.filter((c) => c.type === "date").map((c) => (
          <button key={c.id} type="button" className={menuItem} onClick={() => void db.saveView({ ...view, dateProp: c.id })}>
            <Calendar size={14} /> Usar “{c.name}”{view.dateProp === c.id && " ✓"}
          </button>
        ))}
      </Pop>
      {searching
        ? <input autoFocus aria-label="Buscar na visão" value={search} placeholder="Buscar…"
            onChange={(e) => setSearch(e.target.value)} onBlur={() => !search && setSearching(false)}
            className="w-28 rounded border border-[var(--n-border)] bg-transparent px-1.5 py-0.5 text-xs outline-none" />
        : <button type="button" aria-label="Buscar" onClick={() => setSearching(true)} className={toolbarBtn}><Search size={13} /></button>}
      <DataMenu db={db} view={view} rows={rows} />
      <span className="ml-1 flex items-center gap-px">
        <button type="button" onClick={onNew} className="flex items-center gap-1 rounded-l bg-[var(--n-accent)] px-2 py-1 text-xs font-medium text-white hover:brightness-95">
          <Plus size={13} /> Novo
        </button>
        <NewMenu db={db} defaults={defaults} onCreated={onCreated} />
      </span>
    </div>
  );
}

export function DatabaseView({ databaseId }: { databaseId: string }) {
  const db = useDatabase(databaseId);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [peek, setPeek] = useState<string | null>(null);
  const [addingView, setAddingView] = useState(false);
  const view = db.views.find((v) => v.id === activeId) ?? db.views[0];

  const rows = useMemo(() => applyView(db.rows, view, db.ctx, search), [db.rows, view, db.ctx, search]);

  // Uma linha nova herda os filtros "É" ativos, para não sumir assim que é criada.
  const defaults = useMemo(() => {
    const out: Record<string, any> = {};
    if (view.filterMode === "and") {
      for (const f of view.filters) {
        const col = db.schema.find((c) => c.id === f.prop);
        if (f.op === "is" && f.value && col && (col.type === "select" || col.type === "status")) out[col.id] = f.value;
        if (f.op === "checked" && col) out[col.id] = true;
        if (f.op === "is_me" && col && db.me) out[col.id] = [{ id: db.me.id, name: db.me.label }];
      }
    }
    return out;
  }, [view, db.schema, db.me]);

  const addView = (type: ViewType) => {
    const v = defaultView(type, db.schema);
    void db.setViews([...db.views, v]);
    setActiveId(v.id);
    setAddingView(false);
  };
  const newAndOpen = async () => setPeek((await db.addRow({ row_properties: defaults })).id);
  const Body = VIEWS[view.type];

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--n-border)]">
        <div className="flex min-w-0 flex-wrap items-center gap-0.5">
          {db.views.map((v) => (
            <ViewTab key={v.id} view={v} active={v.id === view.id} db={db} onPick={() => setActiveId(v.id)} onRemoved={() => setActiveId(null)} />
          ))}
          <Pop open={addingView} onOpenChange={setAddingView} width={200} triggerClass="rounded p-1 text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]" trigger={<Plus size={14} aria-label="Adicionar visão" />}>
            {(Object.keys(VIEW_LABEL) as ViewType[]).map((t) => {
              const I = VIEW_ICON[t];
              return <button key={t} type="button" className={menuItem} onClick={() => addView(t)}><I size={14} /> {VIEW_LABEL[t]}</button>;
            })}
            <p className="px-2 pb-0.5 pt-2 text-[11px] text-[var(--n-text-faint)]">Prontas</p>
            {presetsFor(db).map((p) => (
              <button key={p.label} type="button" className={menuItem}
                onClick={() => { const v = p.view(); void db.setViews([...db.views, v]); setActiveId(v.id); setAddingView(false); }}>{p.label}</button>
            ))}
          </Pop>
        </div>
        <Toolbar view={view} db={db} rows={rows} search={search} setSearch={setSearch} onNew={newAndOpen} defaults={defaults} onCreated={setPeek} />
      </div>

      {db.error ? <p role="alert" className="py-8 text-center text-sm text-red-500">Não foi possível carregar o banco de dados.</p>
        : db.isLoading ? <div className="py-12 text-center text-xs text-[var(--n-text-faint)]">Carregando…</div>
        : <Body db={db} view={view} rows={rows} open={setPeek} defaults={defaults} />}

      {peek && (
        <>
          <button type="button" aria-label="Fechar painel" onClick={() => setPeek(null)} className="fixed inset-0 z-40 cursor-default bg-black/10" />
          <aside aria-label="Página da linha" className="n-scroll fixed inset-y-0 right-0 z-50 w-full max-w-[720px] overflow-y-auto border-l border-[var(--n-border)] bg-[var(--n-bg)] shadow-2xl">
            <div className="sticky top-0 z-30 flex items-center gap-1 bg-[var(--n-bg)] p-2">
              <button type="button" aria-label="Fechar" onClick={() => setPeek(null)} className="rounded p-1 hover:bg-[var(--n-hover)]"><X size={15} /></button>
              <Link href={`/workspace/${peek}`} aria-label="Abrir em página inteira" className="rounded p-1 hover:bg-[var(--n-hover)]"><Maximize2 size={14} /></Link>
            </div>
            <PageView key={peek} pageId={peek} />
          </aside>
        </>
      )}
    </div>
  );
}
