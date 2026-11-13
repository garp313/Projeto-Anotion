"use client";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Database, Link2, X } from "lucide-react";
import { usePageTree } from "@/lib/hooks/usePageTree";
import { memberName, useMyRole } from "@/lib/collab";
import { useDatabase, type Db } from "./useDatabase";
import type { ColumnSchema, DatabaseRow } from "./types";
import { applyView, asDate, parseDay } from "./values";
import { compatible, effectiveMap, feedKey, mirrorRow, setWriter, toSource, type Feed, type SourceMap, type SourceRef } from "./sources";
import { LinkSourceForm } from "./LinkSource";
import { OptionTag, Pop, dbLabel, menuItem } from "./ui";

/**
 * Carrega uma fonte (o banco inteiro, com as relações dela) e entrega as linhas já traduzidas
 * para o banco que a mostra. Não desenha nada: só mantém o espelho em dia.
 */
export function SourceFeed({ host, src }: { host: Db; src: SourceRef }) {
  const sdb = useDatabase(src.databaseId);
  const qc = useQueryClient();
  const role = useMyRole().data;
  const { pages } = usePageTree();
  const listed = pages.data?.find((p) => p.id === src.databaseId);
  const label = listed ? dbLabel(listed, pages.data ?? []) : sdb.page?.title || "Fonte";
  const archived = Boolean((sdb.page as { is_archived?: boolean } | undefined)?.is_archived);
  const missing = archived || (!sdb.page && Boolean(sdb.error));
  const editable = role !== "viewer";
  const members = useMemo(() => host.members.map((m) => ({ id: m.id, name: memberName(m), email: m.email })), [host.members]);
  const map = useMemo(() => effectiveMap(host.savedMaps[src.databaseId], host.schema, sdb.schema), [host.savedMaps, src.databaseId, host.schema, sdb.schema]);
  const view = src.viewId ? sdb.views.find((v) => v.id === src.viewId) : undefined;

  const feed = useMemo<Feed>(() => {
    const unmatched = { status: [] as string[], people: [] as { id: string; label: string }[] };
    const base = { label, unmatched, schema: sdb.schema, viewName: view?.name };
    if (missing) return { ...base, state: "missing", rows: [] };
    if (sdb.isLoading || !sdb.page) return { ...base, state: "loading", rows: [] };
    // Só as linhas da própria fonte: se ela também tiver fontes, não vira uma corrente de espelhos.
    const own = sdb.rows.filter((r) => !r.mirror);
    // ID de visão: os filtros e a ordenação dela valem aqui, com o contexto da fonte ("sou eu", relações).
    const list = view ? applyView(own, view, sdb.ctx) : own;
    const rows = list.map((row) => mirrorRow({ row, ref: src, label, map, target: host.schema, sctx: sdb.ctx, members, editable, unmatched }));
    return { ...base, state: "ok", rows, viewMissing: Boolean(src.viewId && !view) };
  }, [label, sdb.schema, sdb.isLoading, sdb.page, sdb.rows, sdb.ctx, missing, view, src, map, host.schema, members, editable]);

  useEffect(() => { qc.setQueryData(feedKey(host.id, src.id), feed); }, [qc, host.id, src.id, feed]);
  // Mudanças feitas no banco que mostra: traduz e grava na página original pelo próprio banco da fonte.
  useEffect(() => {
    setWriter(host.id, src.id, (rowId, colId, value) => {
      const w = toSource({ colId, value, map, target: host.schema, sctx: sdb.ctx, members });
      if ("error" in w) return w.error;
      sdb.setValue(rowId, w.col, w.value);
      return null;
    });
    return () => setWriter(host.id, src.id, null);
  });
  return null;
}

/** Conectar ou trocar uma fonte: colar o ID (banco, visão, coluna ou linha) ou escolher na lista. */
function ConnectForm({ db, replacing, onDone }: { db: Db; replacing?: SourceRef; onDone: () => void }) {
  const { pages } = usePageTree();
  const [note, setNote] = useState<string | null>(null);
  const pick = async (id: string, viewId?: string) => {
    const p = pages.data?.find((x) => x.id === id);
    const label = p ? dbLabel(p, pages.data ?? []) : "Fonte";
    try {
      await (replacing ? db.replaceSource(replacing.id, id, viewId, label) : db.connectSource(id, viewId, label));
      onDone();
    } catch (e) { setNote(e instanceof Error ? e.message : "Não foi possível conectar."); }
  };
  return (
    <div>
      <p className="px-2 pt-1 text-xs text-[var(--n-text-muted)]">
        Cole o ID de um banco ou de uma visão (menu “…” do banco ou lápis da visão → Copiar ID). As demandas aparecem aqui sem ser copiadas.
      </p>
      <LinkSourceForm current={db.id} confirmLabel={replacing ? "Trocar" : "Conectar"} onPick={(id, v) => void pick(id, v)} onCancel={onDone}
        describe={(f) => <>Mostrar aqui as demandas de “{f.title}”{f.viewName ? <>, só as da visão “{f.viewName}”</> : null}? Nada é copiado: mudanças feitas aqui vão para a fonte.</>} />
      {note && <p role="alert" className="px-2 pb-1 text-xs text-red-500">{note}</p>}
    </div>
  );
}

/** Botão para o menu "…" do banco. */
export function ConnectSourceItem({ db, onDone }: { db: Db; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className={menuItem} onClick={() => setOpen(true)}><Link2 size={14} /> Conectar fonte de dados</button>;
  return <ConnectForm db={db} onDone={() => { setOpen(false); onDone(); }} />;
}

/** Barra no topo: de onde vêm as demandas, com trocar, desconectar e revisar mapeamento. */
export function SourcesBar({ db }: { db: Db }) {
  const [reviewing, setReviewing] = useState<SourceRef | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  if (!db.sources.length) return null;
  return (
    <div aria-label="Fontes conectadas" className="mb-2 space-y-1">
      {db.sources.map((ref) => <SourceFeed key={ref.id} host={db} src={ref} />)}
      {db.feeds.map(({ ref, feed }) => {
        const pending = (feed?.unmatched.status.length ?? 0) + (feed?.unmatched.people.length ?? 0);
        return (
          <div key={ref.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-[var(--n-hover)]/50 px-2 py-1 text-xs">
            {feed?.state === "missing" ? (
              <span role="alert" className="flex items-center gap-1 text-orange-600"><AlertTriangle size={12} /> Fonte excluída — reconectar</span>
            ) : (
              <span className="flex min-w-0 items-center gap-1">
                <Database size={12} className="shrink-0 text-[var(--n-text-faint)]" />
                <span className="text-[var(--n-text-muted)]">Fonte:</span>
                <span className="truncate font-medium">{feed?.label ?? "Carregando…"}</span>
                {feed?.viewName && <span className="text-[var(--n-text-faint)]">· visão “{feed.viewName}”</span>}
                {feed?.viewMissing && <span className="text-orange-600">· a visão foi excluída: mostrando tudo</span>}
                {feed?.state === "ok" && <span className="text-[var(--n-text-faint)]">· {feed.rows.length} {feed.rows.length === 1 ? "item" : "itens"}</span>}
              </span>
            )}
            {pending > 0 && <span className="text-orange-600">{pending} {pending === 1 ? "valor sem par" : "valores sem par"}</span>}
            <span className="ml-auto flex items-center gap-1">
              <Pop open={replacing === ref.id} onOpenChange={(o) => setReplacing(o ? ref.id : null)} width={320} align="end"
                triggerClass="rounded px-1.5 py-0.5 hover:bg-[var(--n-active)]" trigger={<span>{feed?.state === "missing" ? "Reconectar" : "Trocar"}</span>}>
                <ConnectForm db={db} replacing={ref} onDone={() => setReplacing(null)} />
              </Pop>
              {feed?.state === "ok" && (
                <button type="button" onClick={() => setReviewing(ref)} className={`rounded px-1.5 py-0.5 hover:bg-[var(--n-active)] ${pending ? "font-medium text-orange-600" : ""}`}>Revisar mapeamento</button>
              )}
              <button type="button" onClick={() => void db.disconnectSource(ref.id)} className="rounded px-1.5 py-0.5 text-red-500 hover:bg-[var(--n-active)]">Desconectar</button>
            </span>
          </div>
        );
      })}
      <Pop open={adding} onOpenChange={setAdding} width={320} triggerClass="rounded px-2 py-0.5 text-xs text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]"
        trigger={<span>+ Conectar outra fonte</span>}>
        <ConnectForm db={db} onDone={() => setAdding(false)} />
      </Pop>
      {reviewing && <MappingDialog db={db} src={reviewing} onClose={() => setReviewing(null)} />}
    </div>
  );
}

const select = "w-full rounded border border-[var(--n-border)] bg-[var(--n-bg)] px-1.5 py-1 text-sm outline-none";

/** De → Para: campos, status e pessoas. Fica salvo por banco de origem, mesmo depois de desconectar. */
function MappingDialog({ db, src, onClose }: { db: Db; src: SourceRef; onClose: () => void }) {
  const feed = db.feeds.find((f) => f.ref.id === src.id)?.feed;
  const source = feed?.schema ?? [];
  const [map, setMap] = useState<SourceMap>(() => effectiveMap(db.savedMaps[src.databaseId], db.schema, source));
  const [busy, setBusy] = useState(false);
  const targets = db.schema.filter((c) => !c.sourceTag && !["formula", "rollup", "relation", "created_time", "created_by", "last_edited_time", "last_edited_by", "unique_id"].includes(c.type));
  const tStatus = db.schema.find((c) => c.type === "status");
  const sStatus = source.find((c) => c.id === (tStatus ? map.fields[tStatus.id]?.[0] : undefined));
  const setField = (t: ColumnSchema, ids: string[]) => setMap((m) => {
    const next = { ...m, fields: { ...m.fields, [t.id]: ids } };
    // Trocou a coluna de status: as opções antigas não valem mais, recalcula as sugestões.
    return t.type === "status" ? effectiveMap({ ...next, status: {} }, db.schema, source) : next;
  });
  const save = async () => { setBusy(true); try { await db.saveSourceMap(src.databaseId, map); onClose(); } finally { setBusy(false); } };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Revisar mapeamento" onClick={(e) => e.stopPropagation()}
        className="n-scroll flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-y-auto rounded-xl border border-[var(--n-border)] bg-[var(--n-bg)] p-4 shadow-2xl">
        <div className="mb-3 flex items-center">
          <h2 className="mr-auto text-sm font-semibold">Revisar mapeamento · {feed?.label}</h2>
          <button type="button" aria-label="Fechar" onClick={onClose} className="rounded p-1 hover:bg-[var(--n-hover)]"><X size={15} /></button>
        </div>

        <p className="mb-1 text-xs font-medium text-[var(--n-text-muted)]">Campos (aqui ← fonte)</p>
        <div className="mb-3 grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
          {targets.map((t) => {
            const options = source.filter((s) => compatible(t, s));
            const chosen = map.fields[t.id] ?? [];
            return (
              <div key={t.id} className="contents">
                <span className="truncate text-sm">{t.name}</span>
                {t.type === "multi_select" ? (
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
                    {options.map((s) => (
                      <label key={s.id} className="flex items-center gap-1">
                        <input type="checkbox" className="accent-[var(--n-accent)]" checked={chosen.includes(s.id)}
                          onChange={(e) => setField(t, e.target.checked ? [...chosen, s.id] : chosen.filter((x) => x !== s.id))} /> {s.name}
                      </label>
                    ))}
                    {!options.length && <span className="text-xs text-[var(--n-text-faint)]">Nenhuma coluna compatível</span>}
                  </span>
                ) : (
                  <select aria-label={`Fonte de ${t.name}`} className={select} value={chosen[0] ?? ""} disabled={t.type === "title"}
                    onChange={(e) => setField(t, e.target.value ? [e.target.value] : [])}>
                    <option value="">— sem par —</option>
                    {options.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>

        {tStatus && sStatus && (
          <>
            <p className="mb-1 text-xs font-medium text-[var(--n-text-muted)]">Status (fonte → aqui)</p>
            <div className="mb-3 grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
              {(sStatus.options ?? []).map((o) => (
                <div key={o.id} className="contents">
                  <span className="min-w-0"><OptionTag option={o} /></span>
                  <select aria-label={`Status para ${o.value}`} className={`${select} ${map.status[o.id] ? "" : "border-orange-500"}`} value={map.status[o.id] ?? ""}
                    onChange={(e) => setMap((m) => ({ ...m, status: { ...m.status, [o.id]: e.target.value || null } }))}>
                    <option value="">Sem status</option>
                    {(tStatus.options ?? []).map((t) => <option key={t.id} value={t.id}>{t.value}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </>
        )}

        {(feed?.unmatched.people.length ?? 0) > 0 && (
          <>
            <p className="mb-1 text-xs font-medium text-[var(--n-text-muted)]">Pessoas sem par no time</p>
            <div className="mb-3 grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
              {feed!.unmatched.people.map((p) => (
                <div key={p.id} className="contents">
                  <span className="truncate text-sm">{p.label}</span>
                  <select aria-label={`Membro para ${p.label}`} className={select} value={map.people[p.id] ?? ""}
                    onChange={(e) => setMap((m) => ({ ...m, people: { ...m.people, [p.id]: e.target.value || null } }))}>
                    <option value="">— sem par —</option>
                    {db.members.map((m) => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-auto flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded px-3 py-1 text-sm hover:bg-[var(--n-hover)]">Cancelar</button>
          <button type="button" disabled={busy} onClick={() => void save()}
            className="rounded bg-[var(--n-accent)] px-3 py-1 text-sm font-medium text-white disabled:opacity-60">{busy ? "Salvando…" : "Salvar mapeamento"}</button>
        </div>
      </div>
    </div>
  );
}

/** Resumo acima das visões: conta as linhas que a visão está mostrando, então respeita os filtros. */
export function DashboardSummary({ db, rows }: { db: Db; rows: DatabaseRow[] }) {
  const status = db.schema.find((c) => c.type === "status");
  const due = db.schema.find((c) => c.type === "date" && /prazo|due|entrega|venc/i.test(c.name)) ?? db.schema.find((c) => c.type === "date");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const optOf = (r: DatabaseRow) => status?.options?.find((o) => o.id === r.row_properties?.[status.id]);
  const done = rows.filter((r) => optOf(r)?.group === "complete").length;
  const late = rows.filter((r) => {
    const d = due ? asDate(r.row_properties?.[due.id]) : null;
    const end = d ? parseDay((d.end ?? d.start).slice(0, 10)) : null;
    return end && end < today && optOf(r)?.group !== "complete";
  }).length;
  const byStatus = (status?.options ?? []).map((o) => ({ o, n: rows.filter((r) => optOf(r)?.id === o.id).length }));
  const none = rows.filter((r) => !optOf(r)).length;
  const pct = rows.length ? Math.round((done / rows.length) * 100) : 0;
  const tile = "rounded-md border border-[var(--n-border)] px-3 py-1.5";
  return (
    <section aria-label="Resumo" className="mb-2 flex flex-wrap items-stretch gap-2 text-xs">
      <div className={tile}><p className="text-[var(--n-text-faint)]">Total</p><p className="text-lg font-semibold">{rows.length}</p></div>
      <div className={tile}>
        <p className="text-[var(--n-text-faint)]">Por status</p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5">
          {byStatus.map(({ o, n }) => <span key={o.id} className="flex items-center gap-1"><OptionTag option={o} /> {n}</span>)}
          {none > 0 && <span className="text-[var(--n-text-muted)]">Sem status {none}</span>}
        </p>
      </div>
      <div className={tile}><p className="text-[var(--n-text-faint)]">Atrasadas</p><p className={`text-lg font-semibold ${late ? "text-red-500" : ""}`}>{late}</p></div>
      <div className={`${tile} min-w-32`}>
        <p className="text-[var(--n-text-faint)]">% concluído</p>
        <p className="flex items-center gap-2">
          <span role="progressbar" aria-valuenow={pct} className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--n-active)]"><span className="block h-full bg-green-500" style={{ width: `${pct}%` }} /></span>
          <span className="text-lg font-semibold">{pct}%</span>
        </p>
      </div>
    </section>
  );
}
