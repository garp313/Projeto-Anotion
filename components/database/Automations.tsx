"use client";
import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X, Zap } from "lucide-react";
import { newId, type ColumnSchema } from "./types";
import { Choice, Pop, fieldClass, toolbarBtn } from "./ui";
import type { Db } from "./useDatabase";
import { ACTION_LABEL, TRIGGER_LABEL, type Action, type Automation, type Trigger } from "@/lib/automations";

type Opt = { value: string; label: string };
const CHOICE_TYPES = ["status", "select", "checkbox"];
const NONE = "__none__";

/** Valores de uma coluna de escolha: opções de status/seleção, ou marcada/desmarcada. */
const valuesOf = (col?: ColumnSchema): Opt[] =>
  !col ? [] : col.type === "checkbox"
    ? [{ value: "true", label: "Marcada" }, { value: "false", label: "Desmarcada" }]
    : (col.options ?? []).map((o) => ({ value: o.id, label: o.value }));
const toValue = (col: ColumnSchema | undefined, v: string) => (col?.type === "checkbox" ? v === "true" : v);
const fromValue = (v: unknown) => (typeof v === "boolean" ? String(v) : String(v ?? ""));

/** Frase curta da regra, para a lista. */
export function describe(rule: Automation, schema: ColumnSchema[]) {
  const col = (id?: string) => schema.find((c) => c.id === id);
  const val = (c: ColumnSchema | undefined, v: unknown) => valuesOf(c).find((o) => o.value === fromValue(v))?.label ?? "?";
  const w = rule.when;
  const when = w.type === "created" ? "Quando criar uma linha"
    : w.type === "overdue" ? `Quando ${col(w.col)?.name ?? "o prazo"} vencer`
    : `Quando ${col(w.col)?.name ?? "?"} = ${val(col(w.col), w.value)}`;
  const then = rule.then.map((a) =>
    a.type === "set_today" ? `${col(a.col)?.name ?? "?"} = hoje`
    : a.type === "set_value" ? `${col(a.col)?.name ?? "?"} = ${val(col(a.col), a.value)}`
    : `avisar ${a.to === "creator" ? "quem criou" : col(a.col)?.name ?? "?"}${a.email ? " (e-mail)" : ""}`).join(", ");
  return `${when} → ${then || "nada"}`;
}

/** Regra pronta para salvar? Devolve o motivo quando falta algo. */
function problem(rule: Automation): string | null {
  if (!rule.name.trim()) return "Dê um nome à automação.";
  const w = rule.when;
  if ((w.type === "changed_to" || w.type === "overdue") && !w.col) return "Escolha a coluna do gatilho.";
  if (w.type === "changed_to" && (w.value === "" || w.value === undefined)) return "Escolha o valor do gatilho.";
  if (!rule.then.length) return "Adicione ao menos uma ação.";
  for (const a of rule.then) {
    if (a.type !== "notify" && !a.col) return "Escolha a coluna de cada ação.";
    if (a.type === "notify" && a.to === "people" && !a.col) return "Escolha a coluna de pessoas a avisar.";
  }
  return null;
}

function Editor({ db, initial, onSave, onCancel }: { db: Db; initial: Automation; onSave: (a: Automation) => void; onCancel: () => void }) {
  const [rule, setRule] = useState<Automation>(initial);
  const [note, setNote] = useState<string | null>(null);
  // O aviso do que falta some assim que a pessoa mexe na regra.
  useEffect(() => setNote(null), [rule]);
  const cols = (types: string[]): Opt[] => db.schema.filter((c) => types.includes(c.type)).map((c) => ({ value: c.id, label: c.name }));
  const col = (id?: string) => db.schema.find((c) => c.id === id);
  const choiceCols = cols(CHOICE_TYPES), dateCols = cols(["date"]), personCols = cols(["person"]);
  const pick = (opts: Opt[], value: string | undefined, onChange: (v: string) => void, label: string) => (
    <Choice label={label} width={220} value={value || NONE} onChange={(v) => v !== NONE && onChange(v)}
      options={value ? opts : [{ value: NONE, label: "Escolha…" }, ...opts]} />
  );
  const setWhen = (w: Trigger) => setRule((r) => ({ ...r, when: w }));
  const setAction = (i: number, a: Action) => setRule((r) => ({ ...r, then: r.then.map((x, j) => (j === i ? a : x)) }));
  const w = rule.when;

  return (
    <div className="space-y-3 p-2 text-sm">
      <input value={rule.name} onChange={(e) => setRule({ ...rule, name: e.target.value })} placeholder="Nome, por exemplo: Concluir tarefa" aria-label="Nome da automação" className={fieldClass} />

      <section className="space-y-1.5">
        <h4 className="text-xs font-medium text-[var(--n-text-muted)]">Quando</h4>
        <Choice label="Gatilho" width={260} value={w.type} options={(Object.keys(TRIGGER_LABEL) as Trigger["type"][]).map((t) => ({ value: t, label: TRIGGER_LABEL[t] }))}
          onChange={(t) => setWhen(t === "created" ? { type: "created" } : t === "overdue" ? { type: "overdue", col: dateCols[0]?.value ?? "" } : { type: "changed_to", col: "", value: "" })} />
        {w.type === "changed_to" && (
          <div className="flex flex-wrap items-center gap-1.5">
            {pick(choiceCols, w.col, (c) => setWhen({ type: "changed_to", col: c, value: "" }), "Coluna do gatilho")}
            {w.col && <span className="text-xs">=</span>}
            {w.col && pick(valuesOf(col(w.col)), w.value === "" ? "" : fromValue(w.value), (v) => setWhen({ ...w, value: toValue(col(w.col), v) }), "Valor do gatilho")}
          </div>
        )}
        {w.type === "overdue" && (dateCols.length ? pick(dateCols, w.col, (c) => setWhen({ type: "overdue", col: c }), "Coluna de prazo")
          : <p className="text-xs text-red-500">Este banco não tem coluna de data.</p>)}
        {w.type === "overdue" && <p className="text-xs text-[var(--n-text-faint)]">Verificado todo dia às 8h (Brasília). Linhas concluídas não contam, e cada prazo avisa uma vez.</p>}
      </section>

      <section className="space-y-1.5">
        <h4 className="text-xs font-medium text-[var(--n-text-muted)]">Então</h4>
        {rule.then.map((a, i) => (
          <div key={i} className="space-y-1 rounded border border-[var(--n-border)] p-1.5">
            <div className="flex items-center gap-1">
              <span className="flex-1 text-xs font-medium">{ACTION_LABEL[a.type]}</span>
              <button type="button" aria-label="Remover ação" onClick={() => setRule({ ...rule, then: rule.then.filter((_, j) => j !== i) })} className="rounded p-0.5 hover:bg-[var(--n-hover)]"><X size={12} /></button>
            </div>
            {a.type === "set_today" && pick(dateCols, a.col, (c) => setAction(i, { ...a, col: c }), "Coluna de data")}
            {a.type === "set_value" && (
              <div className="flex flex-wrap items-center gap-1.5">
                {pick(choiceCols, a.col, (c) => setAction(i, { type: "set_value", col: c, value: null }), "Coluna a definir")}
                {a.col && pick(valuesOf(col(a.col)), a.value === null ? "" : fromValue(a.value), (v) => setAction(i, { ...a, value: toValue(col(a.col), v) }), "Valor a definir")}
              </div>
            )}
            {a.type === "notify" && (
              <>
                <Choice label="Quem avisar" width={240} value={a.to === "creator" ? "creator" : a.col || NONE}
                  options={[...(a.to === "people" && !a.col ? [{ value: NONE, label: "Escolha…" }] : []), ...personCols.map((c) => ({ value: c.value, label: `Pessoas em ${c.label}` })), { value: "creator", label: "Quem criou a linha" }]}
                  onChange={(v) => v !== NONE && setAction(i, v === "creator" ? { ...a, to: "creator", col: undefined } : { ...a, to: "people", col: v })} />
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={a.email} onChange={(e) => setAction(i, { ...a, email: e.target.checked })} /> Também por e-mail
                </label>
              </>
            )}
          </div>
        ))}
        <Choice label="Adicionar ação" width={220} value={NONE}
          options={[{ value: NONE, label: "+ Adicionar ação" }, ...(Object.keys(ACTION_LABEL) as Action["type"][]).map((t) => ({ value: t, label: ACTION_LABEL[t] }))]}
          onChange={(t) => {
            if (t === NONE) return;
            const a: Action = t === "notify" ? { type: "notify", to: personCols.length ? "people" : "creator", col: personCols[0]?.value, email: false }
              : t === "set_today" ? { type: "set_today", col: dateCols[0]?.value ?? "" } : { type: "set_value", col: "", value: null };
            setRule({ ...rule, then: [...rule.then, a] });
          }} />
        {rule.then.some((a) => a.type === "notify" && a.email) && (
          <p className="text-xs text-[var(--n-text-faint)]">O e-mail sai do Gmail de quem fez a mudança (no prazo vencido, de quem criou a regra). Sem Google conectado, o aviso fica só no Inbox.</p>
        )}
      </section>

      {note && <p role="alert" className="text-xs text-red-500">{note}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => { const p = problem(rule); if (p) setNote(p); else onSave({ ...rule, name: rule.name.trim() }); }}
          className="flex-1 rounded bg-[var(--n-accent)] px-2 py-1 text-xs font-medium text-white">Salvar automação</button>
        <button type="button" onClick={onCancel} className="flex-1 rounded border border-[var(--n-border)] px-2 py-1 text-xs hover:bg-[var(--n-hover)]">Cancelar</button>
      </div>
    </div>
  );
}

/** Botão da barra do banco: lista, liga/desliga, cria e edita as automações. */
export function AutomationsMenu({ db }: { db: Db }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const rules = db.automations;
  const active = rules.filter((r) => r.enabled).length;
  const save = (next: Automation[]) => void db.setAutomations(next);
  const blank = (): Automation => ({ id: newId("au_"), name: "", enabled: true, when: { type: "changed_to", col: "", value: "" }, then: [], author: db.me?.id });

  return (
    <Pop open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }} width={400} align="end"
      triggerClass={`${toolbarBtn} ${active ? "text-[var(--n-accent)]" : ""}`}
      trigger={<><Zap size={13} /> Automações{active ? ` (${active})` : ""}</>}>
      {editing ? (
        <Editor db={db} initial={editing} onCancel={() => setEditing(null)} onSave={(a) => {
          save(rules.some((r) => r.id === a.id) ? rules.map((r) => (r.id === a.id ? a : r)) : [...rules, a]);
          setEditing(null);
        }} />
      ) : (
        <div className="space-y-1 p-1 text-sm">
          {!rules.length && (
            <p className="px-1 py-2 text-xs text-[var(--n-text-muted)]">
              Automatize o que se repete. Exemplos: quando Status = Concluído, preencher a data de conclusão e avisar quem pediu; quando o prazo vencer, avisar o responsável por e-mail.
            </p>
          )}
          {rules.map((r) => (
            <div key={r.id} className="flex items-start gap-2 rounded px-1 py-1 hover:bg-[var(--n-hover)]">
              <input type="checkbox" checked={r.enabled} aria-label={`Ligar ${r.name}`} className="mt-1"
                onChange={(e) => save(rules.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x)))} />
              <div className="min-w-0 flex-1">
                <p className={`truncate font-medium ${r.enabled ? "" : "text-[var(--n-text-faint)]"}`}>{r.name}</p>
                <p className="text-xs text-[var(--n-text-muted)]">{describe(r, db.schema)}</p>
              </div>
              <button type="button" aria-label={`Editar ${r.name}`} onClick={() => setEditing(r)} className="rounded p-1 hover:bg-[var(--n-active)]"><Pencil size={12} /></button>
              <button type="button" aria-label={`Excluir ${r.name}`} onClick={() => save(rules.filter((x) => x.id !== r.id))} className="rounded p-1 hover:bg-[var(--n-active)]"><Trash2 size={12} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setEditing(blank())} className="flex w-full items-center gap-1 rounded px-1 py-1.5 text-xs text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]">
            <Plus size={13} /> Nova automação
          </button>
        </div>
      )}
    </Pop>
  );
}
