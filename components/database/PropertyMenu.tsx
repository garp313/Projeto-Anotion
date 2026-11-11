"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, EyeOff, Trash2, X } from "lucide-react";
import { usePageTree } from "@/lib/hooks/usePageTree";
import type { ColumnSchema, DatabaseViewConfig, NumberFormat, PropType, RollupFn, SelectOption, StatusGroup } from "./types";
import { COLORS, DEFAULT_STATUS_OPTIONS, PROP_LABEL, newId } from "./types";
import { evalFormula } from "./formula";
import type { Db } from "./useDatabase";
import { Choice, CopyIdItem, PropIcon, columnRef, fieldClass, menuItem } from "./ui";

export const ADDABLE_TYPES = (Object.keys(PROP_LABEL) as PropType[]).filter((t) => t !== "title");

const NUMBER_FORMATS: [NumberFormat, string][] = [
  ["number", "Número"], ["comma", "Número com separador"], ["percent", "Porcentagem"], ["real", "Real (R$)"], ["dollar", "Dólar"], ["euro", "Euro"],
];
const ROLLUP_FNS: [RollupFn, string][] = [
  ["show_original", "Mostrar original"], ["count", "Contar tudo"], ["count_values", "Contar valores"], ["count_unique", "Contar únicos"],
  ["empty", "Contar vazios"], ["not_empty", "Contar preenchidos"], ["percent_empty", "% vazios"], ["percent_not_empty", "% preenchidos"],
  ["sum", "Soma"], ["average", "Média"], ["median", "Mediana"], ["min", "Mínimo"], ["max", "Máximo"], ["range", "Intervalo"],
  ["earliest", "Data mais antiga"], ["latest", "Data mais recente"], ["percent_complete", "% concluído (Status)"],
];

/** Campos extras exigidos ao trocar para um tipo. */
export function columnDefaults(type: PropType, col?: Partial<ColumnSchema>): Partial<ColumnSchema> {
  if (type === "status") return { options: col?.options?.length ? col.options.map((o) => ({ group: "todo" as const, ...o })) : DEFAULT_STATUS_OPTIONS };
  if (type === "select" || type === "multi_select") return { options: col?.options ?? [] };
  return {};
}

function OptionsEditor({ col, onChange }: { col: ColumnSchema; onChange: (o: SelectOption[]) => void }) {
  const options = col.options ?? [];
  const patch = (id: string, p: Partial<SelectOption>) => onChange(options.map((o) => (o.id === id ? { ...o, ...p } : o)));
  return (
    <div className="space-y-1 p-1">
      <p className="text-[11px] text-[var(--n-text-faint)]">Opções</p>
      {options.map((o) => (
        <div key={o.id} className="flex items-center gap-1">
          <select aria-label="Cor" value={o.color} onChange={(e) => patch(o.id, { color: e.target.value })}
            className={`w-6 shrink-0 cursor-pointer appearance-none rounded text-transparent ${o.color}`}>
            {COLORS.map((c) => <option key={c.cls} value={c.cls} className="bg-[var(--n-bg)] text-[var(--n-text)]">{c.name}</option>)}
            {!COLORS.some((c) => c.cls === o.color) && <option value={o.color}>Atual</option>}
          </select>
          <input aria-label="Nome da opção" defaultValue={o.value} className={fieldClass}
            onBlur={(e) => e.target.value.trim() && e.target.value !== o.value && patch(o.id, { value: e.target.value.trim() })} />
          {col.type === "status" && (
            <select aria-label="Grupo" value={o.group ?? "todo"} onChange={(e) => patch(o.id, { group: e.target.value as StatusGroup })}
              className="w-20 shrink-0 rounded border border-[var(--n-border)] bg-[var(--n-bg)] text-xs">
              <option value="todo">A fazer</option>
              <option value="in_progress">Andamento</option>
              <option value="complete">Concluído</option>
            </select>
          )}
          <button type="button" aria-label={`Excluir ${o.value}`} onClick={() => onChange(options.filter((x) => x.id !== o.id))}
            className="rounded p-1 hover:bg-[var(--n-hover)]"><X size={13} /></button>
        </div>
      ))}
      <button type="button" className={menuItem}
        onClick={() => onChange([...options, {
          id: newId("o_"), value: `Opção ${options.length + 1}`, color: COLORS[(options.length + 1) % COLORS.length].cls,
          ...(col.type === "status" ? { group: "todo" as const } : {}),
        }])}>
        + Adicionar opção
      </button>
    </div>
  );
}

function FormulaEditor({ col, db, onChange }: { col: ColumnSchema; db: Db; onChange: (f: string) => void }) {
  const [src, setSrc] = useState(col.formula ?? "");
  const check = evalFormula(src, () => 0);
  // erros de prop() só aparecem na linha; aqui validamos a sintaxe e os nomes
  const missing = [...src.matchAll(/prop\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]).filter((n) => !db.schema.some((s) => s.name === n));
  const error = missing.length ? `Propriedade não encontrada: ${missing[0]}` : check.error && !/Date|Invalid/.test(check.error) ? check.error : null;
  return (
    <div className="p-1">
      <p className="mb-1 text-[11px] text-[var(--n-text-faint)]">Fórmula</p>
      <textarea
        rows={3} value={src} spellCheck={false} aria-label="Fórmula" className={`${fieldClass} font-mono text-xs`}
        placeholder={'if(prop("Prioridade") == "Alta", "🔥", "")'}
        onChange={(e) => setSrc(e.target.value)} onBlur={() => src !== col.formula && onChange(src)}
      />
      {error
        ? <p role="alert" className="mt-1 text-xs text-red-500">{error}</p>
        : <p className="mt-1 text-[11px] text-[var(--n-text-faint)]">Use prop("Nome"), if, concat, dateBetween, round…</p>}
    </div>
  );
}

/** Liga ou desliga a propriedade espelho no banco de destino. */
function TwoWayToggle({ col, db }: { col: ColumnSchema; db: Db }) {
  const [busy, setBusy] = useState(false);
  async function toggle(on: boolean) {
    setBusy(true);
    try { await (on ? db.linkRelation(col, col.relationDatabaseId) : db.unlinkMirror(col)); } finally { setBusy(false); }
  }
  return (
    <label className={menuItem}>
      <input type="checkbox" disabled={busy} checked={Boolean(col.relationSyncProp)} className="accent-[var(--n-accent)]"
        onChange={(e) => toggle(e.target.checked)} /> Mostrar no banco relacionado
    </label>
  );
}

function ConfigFor({ col, db, save }: { col: ColumnSchema; db: Db; save: (c: ColumnSchema) => void }) {
  const { pages } = usePageTree();
  const select = "w-full rounded border border-[var(--n-border)] bg-[var(--n-bg)] px-2 py-1 text-sm outline-none";
  const label = "mb-1 block text-[11px] text-[var(--n-text-faint)]";

  switch (col.type) {
    case "number":
      return (
        <label className="block p-1"><span className={label}>Formato</span>
          <select className={select} value={col.numberFormat ?? "number"} onChange={(e) => save({ ...col, numberFormat: e.target.value as NumberFormat })}>
            {NUMBER_FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      );
    case "select": case "multi_select": case "status":
      return <OptionsEditor col={col} onChange={(options) => save({ ...col, options })} />;
    case "formula":
      return <FormulaEditor col={col} db={db} onChange={(formula) => save({ ...col, formula })} />;
    case "unique_id":
      return (
        <label className="block p-1"><span className={label}>Prefixo</span>
          <input className={fieldClass} defaultValue={col.idPrefix ?? ""} placeholder="TASK"
            onBlur={(e) => save({ ...col, idPrefix: e.target.value.trim() })} />
        </label>
      );
    case "relation": {
      const dbs = (pages.data ?? []).filter((p) => p.is_database);
      return (
        <div className="p-1">
          <label className="block"><span className={label}>Relacionar com</span>
            {col.relationDatabaseId && db.ctx.related[col.relationDatabaseId]?.missing && (
              <span role="alert" className="mb-1 block text-xs text-orange-600">Banco relacionado excluído — escolha outro.</span>
            )}
            <Choice label="Relacionar com" width={240} value={col.relationDatabaseId ?? ""}
              options={dbs.map((p) => ({ value: p.id, label: p.title || "Sem título" }))}
              onChange={(id) => void db.linkRelation(col, id)} />
          </label>
          {col.relationDatabaseId && (
            <label className="mt-1 block"><span className={label}>Mostrar coluna</span>
              <Choice label="Mostrar coluna" width={240} value={col.relationShowProp ?? ""}
                options={[
                  { value: "", label: "Nome da linha" },
                  ...(db.ctx.related[col.relationDatabaseId]?.schema ?? [])
                    .filter((c) => c.type !== "title" && c.id !== col.relationSyncProp)
                    .map((c) => ({ value: c.id, label: c.name })),
                ]}
                onChange={(id) => save({ ...col, relationShowProp: id || undefined })} />
            </label>
          )}
          {col.relationDatabaseId && <TwoWayToggle col={col} db={db} />}
        </div>
      );
    }
    case "rollup": {
      const relations = db.schema.filter((c) => c.type === "relation");
      const cfg = col.rollup ?? { relationProp: "", targetProp: "", fn: "show_original" as RollupFn };
      const rel = relations.find((r) => r.id === cfg.relationProp);
      const targets = (rel?.relationDatabaseId ? db.ctx.related[rel.relationDatabaseId]?.schema ?? [] : [])
        .filter((t) => t.id !== rel?.relationSyncProp);
      // Sem relação ainda, dá para criar uma aqui mesmo: antes era preciso saber a ordem certa.
      const others = (pages.data ?? []).filter((p) => p.is_database && p.id !== db.id);
      const relationOptions = [
        ...relations.map((r) => ({ value: r.id, label: r.name })),
        ...others.map((p) => ({ value: `new:${p.id}`, label: `Nova relação com “${p.title || "Sem título"}”` })),
      ];
      const pick = (value: string) => {
        if (!value.startsWith("new:")) return save({ ...col, rollup: { ...cfg, relationProp: value, targetProp: "" } });
        const target = others.find((p) => p.id === value.slice(4));
        if (target) void db.linkRollup(col, target.id, target.title);
      };
      return (
        <div className="space-y-1 p-1">
          <div><span className={label}>Relação</span>
            <Choice label="Relação da rollup" width={280} value={cfg.relationProp} options={relationOptions} onChange={pick} /></div>
          <div><span className={label}>Propriedade</span>
            <Choice label="Propriedade da rollup" width={240} value={cfg.targetProp} options={targets.map((t) => ({ value: t.id, label: t.name }))}
              onChange={(targetProp) => save({ ...col, rollup: { ...cfg, targetProp } })} /></div>
          <div><span className={label}>Calcular</span>
            <Choice label="Cálculo da rollup" width={240} value={cfg.fn} options={ROLLUP_FNS.map(([value, l]) => ({ value, label: l }))}
              onChange={(fn) => save({ ...col, rollup: { ...cfg, fn } })} /></div>
          {!rel && <p className="text-xs text-[var(--n-text-faint)]">Escolha uma relação deste banco ou crie uma nova com outro banco.</p>}
          {rel && !targets.length && <p className="text-xs text-[var(--n-text-faint)]">Carregando as propriedades do outro banco…</p>}
        </div>
      );
    }
    default: return null;
  }
}

/** Conteúdo do menu de uma propriedade: nome, tipo, configuração e ações. */
export function PropertyMenu({ col, db, view, onClose }: { col: ColumnSchema; db: Db; view: DatabaseViewConfig; onClose: () => void }) {
  const save = (c: ColumnSchema) => void db.saveColumn(c);
  const sortBy = (dir: "asc" | "desc") => {
    void db.saveView({ ...view, sorts: [{ prop: col.id, dir }, ...view.sorts.filter((s) => s.prop !== col.id)] });
    onClose();
  };
  const isTitle = col.type === "title";
  // Trocar o tipo de um lado da relação quebrava o outro: foi assim que o status dos projetos se perdeu.
  const locked = col.type === "relation" && Boolean(col.relationSyncProp);
  const changeType = (type: PropType) => {
    const { relationDatabaseId: _a, relationSyncProp: _b, ...rest } = col;
    save({ ...rest, type, ...columnDefaults(type, col) });
  };
  return (
    <div>
      <div className="p-1">
        <input aria-label="Nome da propriedade" defaultValue={col.name} className={fieldClass}
          onBlur={(e) => e.target.value.trim() && e.target.value !== col.name && save({ ...col, name: e.target.value.trim() })}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      </div>
      {!isTitle && (
        <label className="block p-1">
          <span className="mb-1 flex items-center gap-1 text-[11px] text-[var(--n-text-faint)]"><PropIcon type={col.type} size={12} /> Tipo</span>
          {locked
            ? <span className="block px-1 text-xs text-[var(--n-text-muted)]">Relação ligada a outro banco. Para trocar o tipo, primeiro desmarque “Mostrar no banco relacionado”.</span>
            : <Choice label="Tipo" width={230} value={col.type} options={ADDABLE_TYPES.map((t) => ({ value: t, label: PROP_LABEL[t] }))} onChange={changeType} />}
        </label>
      )}
      <ConfigFor col={col} db={db} save={save} />
      <div className="my-1 border-t border-[var(--n-border)]" />
      <button type="button" className={menuItem} onClick={() => sortBy("asc")}><ArrowUp size={14} /> Ordenar crescente</button>
      <button type="button" className={menuItem} onClick={() => sortBy("desc")}><ArrowDown size={14} /> Ordenar decrescente</button>
      <CopyIdItem value={columnRef(db.id, col.id)} label="Copiar ID da coluna" />
      {!isTitle && (
        <>
          <button type="button" className={menuItem} onClick={() => { void db.saveView({ ...view, hidden: [...view.hidden, col.id] }); onClose(); }}>
            <EyeOff size={14} /> Ocultar na visão
          </button>
          <button type="button" className={menuItem} onClick={() => { db.addColumn({ ...col, name: `${col.name} (cópia)` }); onClose(); }}>
            <Copy size={14} /> Duplicar propriedade
          </button>
          <button type="button" className={`${menuItem} text-red-500`} onClick={() => { void db.removeColumn(col); onClose(); }}>
            <Trash2 size={14} /> Excluir propriedade
          </button>
        </>
      )}
    </div>
  );
}

/** Menu "+": lista os tipos e cria a propriedade já com o nome do tipo. */
export function AddPropertyMenu({ db, onDone }: { db: Db; onDone: () => void }) {
  return (
    <div>
      <p className="px-2 py-1 text-[11px] text-[var(--n-text-faint)]">Tipo de propriedade</p>
      {ADDABLE_TYPES.map((t) => (
        <button key={t} type="button" className={menuItem}
          onClick={() => { db.addColumn({ name: PROP_LABEL[t], type: t, ...columnDefaults(t) }); onDone(); }}>
          <PropIcon type={t} /> {PROP_LABEL[t]}
        </button>
      ))}
      <p className="px-2 pb-1 pt-2 text-[11px] text-[var(--n-text-faint)]">Para demandas</p>
      <button type="button" className={menuItem} onClick={() => { void db.addSelfRelation("Bloqueado por", "Bloqueia"); onDone(); }}>
        <PropIcon type="relation" /> Dependência (Bloqueado por)
      </button>
      <button type="button" className={menuItem} onClick={() => { void db.addSelfRelation("Subitens", "Item pai"); onDone(); }}>
        <PropIcon type="relation" /> Subitens (tarefas reais)
      </button>
    </div>
  );
}
