"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { memberName, useMembers } from "@/lib/collab";
import { usePageTree } from "@/lib/hooks/usePageTree";
import { schemaOf } from "@/components/database/useDatabase";
import type { ColumnSchema, PropType } from "@/components/database/types";
import { DEFAULT_SCHEMA, PROP_LABEL, READ_ONLY, newId } from "@/components/database/types";
import { displayText } from "@/components/database/values";
import { Choice, fieldClass } from "@/components/database/ui";
import { readNotionFile, type NotionDb, type NotionExport } from "@/lib/import/notionZip";
import { applyToSchema, convertRow, suggestColumns, suggestPeople, suggestValues, type ColumnDest, type ColumnPlan, type DbPlan } from "@/lib/import/mapping";
import { runImport, undoImport, type ImportMode, type ImportReport } from "@/lib/import/runner";

type Step = "upload" | "map" | "review" | "running" | "report";

const NEW_TYPES: PropType[] = ["text", "number", "select", "multi_select", "status", "date", "person", "files", "checkbox", "url", "email", "phone", "relation"];
const TASKS = "__tasks";

const destKey = (d: ColumnDest) =>
  d.kind === "title" || d.kind === "ignore" ? d.kind : d.kind === "existing" ? `col:${d.colId}${d.part ? `:${d.part}` : ""}` : `new:${d.type}`;

function makePlan(db: NotionDb, target: DbPlan["target"], schema: ColumnSchema[], members: { id: string; name: string; email: string }[]): DbPlan {
  const columns = suggestColumns(db, schema);
  return { db, target, columns, values: suggestValues(db, columns, schema), people: suggestPeople(db, columns, schema, members), sendToTasks: false };
}

function ColumnRow({ c, schema, onChange }: { c: ColumnPlan; schema: ColumnSchema[]; onChange: (d: ColumnDest) => void }) {
  const options = [
    { value: "title", label: "Título" },
    ...schema.filter((s) => s.type !== "title" && !READ_ONLY.includes(s.type)).flatMap((s) => (
      s.type === "date"
        ? [{ value: `col:${s.id}`, label: s.name }, { value: `col:${s.id}:start`, label: `${s.name} (início)` }, { value: `col:${s.id}:end`, label: `${s.name} (fim)` }]
        : [{ value: `col:${s.id}`, label: s.name }]
    )),
    ...NEW_TYPES.map((t) => ({ value: `new:${t}`, label: `Criar: ${PROP_LABEL[t]}` })),
    { value: "ignore", label: "Ignorar" },
  ];
  const pick = (v: string) => {
    if (v === "title" || v === "ignore") return onChange({ kind: v });
    const [kind, id, part] = v.split(":");
    if (kind === "new") return onChange({ kind: "new", type: id as PropType, name: c.source });
    onChange({ kind: "existing", colId: id, ...(part ? { part: part as "start" | "end" } : {}) });
  };
  return (
    <tr className="border-t border-[var(--n-border)]">
      <td className="py-1 pr-2 align-top font-medium">{c.source}</td>
      <td className="py-1 pr-2 align-top text-xs text-[var(--n-text-muted)]">{PROP_LABEL[c.detected]}</td>
      <td className="py-1 pr-2 align-top"><Choice label={`Destino de ${c.source}`} width={230} value={destKey(c.dest)} options={options} onChange={pick} /></td>
      <td className="max-w-[260px] truncate py-1 align-top text-xs text-[var(--n-text-faint)]" title={c.samples.join(" | ")}>{c.samples.join(" · ") || "Sem valores"}</td>
    </tr>
  );
}

export function ImportWizard({ databaseId, parentId = null, onClose }: { databaseId?: string; parentId?: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { pages, workspace } = usePageTree();
  const { data: members = [] } = useMembers();
  const [step, setStep] = useState<Step>("upload");
  const [exp, setExp] = useState<NotionExport | null>(null);
  const [plans, setPlans] = useState<DbPlan[]>([]);
  const [schemas, setSchemas] = useState<Record<string, ColumnSchema[]>>({});
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<ImportMode>("add");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 1, label: "" });
  const [report, setReport] = useState<ImportReport | null>(null);
  const [undone, setUndone] = useState(false);
  const stop = useRef(false);

  const databases = useMemo(() => {
    const all = pages.data ?? [];
    const ids = new Set(all.filter((p) => p.is_database).map((p) => p.id));
    return all.filter((p) => p.is_database && !(p.parent_id && ids.has(p.parent_id)));
  }, [pages.data]);
  const tasksDb = databases.find((d) => d.title === "Tarefas");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && step !== "running") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, onClose]);

  const loadSchema = async (id: string) => {
    if (schemas[id]) return schemas[id];
    const { data } = await createClient().from("pages").select("database_schema").eq("id", id).single();
    const schema = schemaOf(data as any);
    setSchemas((s) => ({ ...s, [id]: schema }));
    return schema;
  };

  async function pickFile(file?: File) {
    if (!file) return;
    setError(null);
    try {
      const data = await readNotionFile(file);
      if (!data.databases.length && !data.pages.length) return setError("Não encontrei bancos nem páginas neste arquivo.");
      const list: DbPlan[] = [];
      // Bancos de fora primeiro: é a ordem em que a importação precisa deles.
      for (const db of [...data.databases].sort((a, b) => a.path.split("/").length - b.path.split("/").length)) {
        const target = databaseId && data.databases.length === 1 ? { kind: "existing" as const, id: databaseId } : { kind: "new" as const, title: db.name };
        const schema = target.kind === "existing" ? await loadSchema(target.id) : [];
        list.push(makePlan(db, target, schema, members));
      }
      setExp(data); setPlans(list); setIndex(0);
      setStep(list.length ? "map" : "review");
    } catch {
      setError("Não foi possível ler o arquivo. Use o .zip de Exportar › Markdown & CSV, ou um .csv.");
    }
  }

  const plan = plans[index];
  const schema = plan?.target.kind === "existing" ? schemas[plan.target.id] ?? DEFAULT_SCHEMA : [];
  const update = (next: Partial<DbPlan>) => setPlans((list) => list.map((p, i) => (i === index ? { ...p, ...next } : p)));

  const setColumn = (source: string, dest: ColumnDest) => {
    const columns = plan.columns.map((c) => (c.source === source ? { ...c, dest } : c));
    update({ columns, values: suggestValues(plan.db, columns, schema), people: suggestPeople(plan.db, columns, schema, members) });
  };
  const setTarget = async (value: string) => {
    const target = value === "__new" ? { kind: "new" as const, title: plan.db.name } : { kind: "existing" as const, id: value };
    const next = target.kind === "existing" ? await loadSchema(target.id) : [];
    setPlans((list) => list.map((p, i) => (i === index ? makePlan(p.db, target, next, members) : p)));
  };

  /** Mapeia direto para o banco Tarefas: assim Responsável e Prazo caem nas colunas certas. */
  const sendToTasks = async (on: boolean) => {
    const target = on && tasksDb ? { kind: "existing" as const, id: tasksDb.id } : { kind: "new" as const, title: plan.db.name };
    const next = target.kind === "existing" ? await loadSchema(target.id) : [];
    setPlans((list) => list.map((p, i) => (i === index ? { ...makePlan(p.db, target, next, members), sendToTasks: on } : p)));
  };

  const preview = useMemo(() => {
    if (!plan) return null;
    const { schema: next, ids } = applyToSchema(plan, schema.length ? schema : [{ id: "title", name: "Nome", type: "title" }], newId);
    const ctx = { schema: next, related: {}, userLabel: () => "" };
    const cols = next.filter((c) => c.type !== "title");
    const rows = plan.db.rows.slice(0, 10).map((r, i) => convertRow(plan, r, i, next, ids));
    const issues = plan.db.rows.flatMap((r, i) => convertRow(plan, r, i, next, ids).issues);
    const outsiders = Object.values(plan.people).filter((p) => p.kind !== "member").length;
    return { cols: cols.filter((c) => rows.some((r) => r.props[c.id] !== undefined)), rows, ctx, issues, outsiders, newCols: next.length - Math.max(schema.length, 1) };
  }, [plan, schema]);

  async function start() {
    if (!exp || !workspace.data) return;
    setStep("running"); setError(null); stop.current = false;
    try {
      const { data } = await createClient().auth.getSession();
      setReport(await runImport(exp, plans, {
        workspaceId: workspace.data.id, userId: data.session?.user.id ?? "", mode, members, qc, parentId,
        onProgress: (done, total, label) => setProgress({ done, total, label }), cancelled: () => stop.current,
      }));
      setStep("report");
    } catch (e: any) {
      setError(e?.code === "42501" ? "Você não tem permissão para importar." : e?.code === "PGRST202" || e?.code === "PGRST205" ? "Falta rodar a migration 0011 no Supabase." : "A importação parou por um erro. O que entrou até aqui continua no banco: confira antes de tentar de novo.");
      setStep("review");
    }
  }

  const button = "rounded bg-[var(--n-accent)] px-3 py-1.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50";
  const ghost = "rounded px-3 py-1.5 text-sm hover:bg-[var(--n-hover)]";

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/40 p-3">
      <div role="dialog" aria-modal="true" aria-label="Importar do Notion" className="flex max-h-[90vh] w-full max-w-[860px] flex-col rounded-xl border border-[var(--n-border)] bg-[var(--n-bg)] shadow-2xl">
        <header className="flex items-center gap-2 border-b border-[var(--n-border)] px-4 py-3">
          <h2 className="flex-1 font-semibold">Importar do Notion</h2>
          {step !== "running" && <button type="button" aria-label="Fechar" onClick={onClose} className="rounded p-1 hover:bg-[var(--n-hover)]"><X size={16} /></button>}
        </header>

        <div className="n-scroll flex-1 overflow-y-auto p-4 text-sm">
          {error && <p role="alert" className="mb-3 rounded border border-red-500/60 px-3 py-2 text-red-500">{error}</p>}

          {step === "upload" && (
            <label className="block cursor-pointer rounded-lg border border-dashed border-[var(--n-border)] p-10 text-center hover:bg-[var(--n-hover)]">
              <FileUp size={26} className="mx-auto mb-2 text-[var(--n-text-faint)]" />
              <span className="block font-medium">Escolher arquivo .zip ou .csv</span>
              <span className="mt-1 block text-xs text-[var(--n-text-muted)]">No Notion: … › Exportar › Markdown &amp; CSV, com subpáginas.</span>
              <input type="file" hidden aria-label="Arquivo do Notion" accept=".zip,.csv" onChange={(e) => void pickFile(e.target.files?.[0])} />
            </label>
          )}

          {step === "map" && plan && (
            <div className="space-y-5">
              {plans.length > 1 && <p className="text-xs text-[var(--n-text-muted)]">Banco {index + 1} de {plans.length}: {plan.db.name}</p>}
              <section aria-label="Destino">
                <h3 className="mb-1 font-medium">Destino de “{plan.db.name}” <span className="font-normal text-[var(--n-text-faint)]">{plan.db.rows.length} linhas</span></h3>
                <Choice label="Banco de destino" width={280} value={plan.target.kind === "new" ? "__new" : plan.target.id}
                  options={[{ value: "__new", label: "Criar banco novo" }, ...databases.map((d) => ({ value: d.id, label: d.title || "Sem título" }))]} onChange={(v) => void setTarget(v)} />
                {plan.db.parent && tasksDb && (
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={plan.sendToTasks} className="accent-[var(--n-accent)]" onChange={(e) => void sendToTasks(e.target.checked)} />
                    Enviar as linhas para o banco Tarefas e relacionar ao projeto
                  </label>
                )}
              </section>

              <section aria-label="Colunas">
                <h3 className="mb-1 font-medium">Colunas</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left">
                    <thead className="text-xs text-[var(--n-text-faint)]"><tr><th className="font-normal">Notion</th><th className="font-normal">Detectado</th><th className="font-normal">Destino</th><th className="font-normal">Amostra</th></tr></thead>
                    <tbody>{plan.columns.map((c) => <ColumnRow key={c.source} c={c} schema={schema} onChange={(d) => setColumn(c.source, d)} />)}</tbody>
                  </table>
                </div>
              </section>

              {Object.entries(plan.values).map(([source, values]) => {
                const dest = plan.columns.find((c) => c.source === source)?.dest;
                const col = dest?.kind === "existing" ? schema.find((s) => s.id === dest.colId) : undefined;
                const known = col?.options?.map((o) => o.value) ?? [];
                return (
                  <section key={source} aria-label={`Valores de ${source}`}>
                    <h3 className="mb-1 font-medium">Valores de {source}</h3>
                    {Object.entries(values).map(([value, to]) => (
                      <div key={value} className="flex items-center gap-2 py-0.5">
                        <span className="w-44 truncate" title={value}>{value}</span>
                        <span className="text-[var(--n-text-faint)]">→</span>
                        <Choice label={`Destino de ${value}`} width={220} value={to}
                          options={[...new Set([value, ...known])].map((o) => ({ value: o, label: known.some((k) => k.toLowerCase() === o.toLowerCase()) ? o : `Criar “${o}”` }))}
                          onChange={(next) => update({ values: { ...plan.values, [source]: { ...values, [value]: next } } })} />
                      </div>
                    ))}
                  </section>
                );
              })}

              {Object.keys(plan.people).length > 0 && (
                <section aria-label="Pessoas">
                  <h3 className="mb-1 font-medium">Pessoas</h3>
                  <p className="mb-1 text-xs text-[var(--n-text-muted)]">Quem não tem conta fica na coluna de texto “Responsáveis (Notion)”.</p>
                  {Object.entries(plan.people).map(([name, p]) => (
                    <div key={name} className="flex items-center gap-2 py-0.5">
                      <span className="w-52 truncate" title={name}>{name}</span>
                      <span className="text-[var(--n-text-faint)]">→</span>
                      <Choice label={`Pessoa ${name}`} width={260} value={p.kind === "member" ? p.id : "text"}
                        options={[...members.map((m) => ({ value: m.id, label: memberName(m) })), { value: "text", label: "Guardar como texto" }]}
                        onChange={(v) => {
                          const m = members.find((x) => x.id === v);
                          update({ people: { ...plan.people, [name]: m ? { kind: "member", id: m.id, name: memberName(m) } : { kind: "text" } } });
                        }} />
                    </div>
                  ))}
                </section>
              )}
            </div>
          )}

          {step === "review" && (
            <div className="space-y-3">
              <p>{plans.reduce((n, p) => n + p.db.rows.length, 0)} linhas em {plans.length} banco(s) e {exp?.pages.length ?? 0} página(s).</p>
              {preview && (
                <>
                  <p className="text-xs text-[var(--n-text-muted)]">
                    {preview.newCols > 0 && `${preview.newCols} coluna(s) nova(s). `}
                    {preview.outsiders > 0 && `${preview.outsiders} pessoa(s) sem conta ficam como texto. `}
                    {preview.issues.length > 0 && `${preview.issues.length} valor(es) não reconhecido(s) vão para “Notas de importação”.`}
                  </p>
                  <div className="overflow-x-auto">
                    <table aria-label="Prévia" className="w-full min-w-[640px] text-left text-xs">
                      <thead className="text-[var(--n-text-faint)]"><tr><th className="pr-2 font-normal">Título</th>{preview.cols.map((c) => <th key={c.id} className="pr-2 font-normal">{c.name}</th>)}</tr></thead>
                      <tbody>
                        {preview.rows.map((r, i) => (
                          <tr key={i} className="border-t border-[var(--n-border)]">
                            <td className="max-w-[200px] truncate py-1 pr-2">{r.title || "Sem título"}</td>
                            {preview.cols.map((c) => <td key={c.id} className="max-w-[160px] truncate py-1 pr-2">{displayText(c, r.props[c.id] ?? (["multi_select", "person", "files"].includes(c.type) ? [] : ""), preview.ctx)}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <fieldset className="space-y-1">
                <legend className="mb-1 font-medium">Se o item já existir</legend>
                <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === "add"} onChange={() => setMode("add")} /> Manter o que já está aqui e adicionar só o que é novo</label>
                <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === "update"} onChange={() => setMode("update")} /> Atualizar com os dados do arquivo</label>
              </fieldset>
            </div>
          )}

          {step === "running" && (
            <div className="py-8">
              <p className="mb-2 truncate">{progress.label || "Preparando…"}</p>
              <div role="progressbar" aria-valuenow={Math.round((progress.done / progress.total) * 100)} className="h-2 overflow-hidden rounded-full bg-[var(--n-active)]">
                <div className="h-full bg-[var(--n-accent)] transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          )}

          {step === "report" && report && (
            <div className="space-y-3">
              {report.cancelled && <p role="status" className="text-orange-500">Importação cancelada. O que entrou até aqui pode ser desfeito.</p>}
              <p role="status" className="font-medium">{report.created} criado(s), {report.updated} atualizado(s), {report.skipped} ignorado(s), {report.issues.length} valor(es) com problema.</p>
              {report.notes.map((n) => <p key={n} className="text-xs text-[var(--n-text-muted)]">{n}</p>)}
              <p className="text-xs text-[var(--n-text-muted)]">O CSV do Notion não traz as visões nem fórmulas e rollups: valores desses tipos entram como texto, e gráficos não existem aqui.</p>
              {report.issues.length > 0 && (
                <ul aria-label="Problemas" className="max-h-52 overflow-y-auto text-xs">
                  {report.issues.map((i, n) => <li key={n} className="border-t border-[var(--n-border)] py-1">Linha {i.row}, {i.column}: “{i.value}”. {i.reason}.</li>)}
                </ul>
              )}
              {undone && <p role="status">Importação desfeita.</p>}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--n-border)] px-4 py-3">
          {step === "map" && <>
            {index > 0 && <button type="button" className={ghost} onClick={() => setIndex(index - 1)}>Banco anterior</button>}
            {index < plans.length - 1
              ? <button type="button" className={button} onClick={() => setIndex(index + 1)}>Próximo banco</button>
              : <button type="button" className={button} onClick={() => setStep("review")}>Revisar</button>}
          </>}
          {step === "review" && <>
            <button type="button" className={ghost} onClick={() => setStep("map")} disabled={!plans.length}>Voltar</button>
            <button type="button" className={button} disabled={!workspace.data} onClick={() => void start()}>Importar</button>
          </>}
          {step === "running" && <button type="button" className={ghost} onClick={() => { stop.current = true; }}>Cancelar</button>}
          {step === "report" && report && <>
            {!undone && <button type="button" className={ghost} onClick={async () => { await undoImport(report.importId, qc); setUndone(true); }}>Desfazer importação</button>}
            {report.openId && !undone && <button type="button" className={ghost} onClick={() => { onClose(); router.push(`/workspace/${report.openId}`); }}>Abrir banco</button>}
            <button type="button" className={button} onClick={onClose}>Concluir</button>
          </>}
        </footer>
      </div>
    </div>
  );
}
