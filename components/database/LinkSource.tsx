"use client";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Database } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { DatabaseViewConfig } from "./types";
import type { ReactNode } from "react";
import { dbLabel, fieldClass, menuItem, parseRef } from "./ui";

type Found = { db: string; title: string; view?: string; viewName?: string };
type Listed = { id: string; title: string; icon: string | null; is_database: boolean; parent_id: string | null };

/**
 * Descobre o banco por trás de qualquer ID: do banco, de uma visão, de uma coluna ou de uma linha.
 * Assim tanto faz qual ID a pessoa copiou: o bloco sempre mostra o banco certo.
 */
export async function resolveDbRef(text: string): Promise<Found | { error: string }> {
  const ref = parseRef(text);
  if (!ref) return { error: "Isso não parece um ID. Use “Copiar ID” no menu do banco, da visão, da coluna ou da linha." };
  const supabase = createClient();
  const get = async (id: string) => (await supabase.from("pages").select("id,title,is_database,is_archived,parent_id,row_properties").eq("id", id).maybeSingle()).data;
  let page = await get(ref.id);
  if (!page) return { error: "Nenhum banco ou linha com esse ID neste espaço de trabalho." };
  // ID de linha: o banco é a página-mãe.
  if (!page.is_database) {
    const parent = page.parent_id ? await get(page.parent_id) : null;
    if (!parent?.is_database) return { error: "Esse ID é de uma página comum, não de um banco." };
    page = parent;
  }
  if (page.is_archived) return { error: `O banco “${page.title || "Sem título"}” está na lixeira.` };
  const views: DatabaseViewConfig[] = page.row_properties?.__views ?? [];
  const view = ref.view ? views.find((v) => v.id === ref.view) : undefined;
  return { db: page.id, title: page.title || "Sem título", view: view?.id, viewName: view?.name };
}

/** Colar um ID ou escolher da lista: o bloco passa a mostrar esse banco, com os mesmos dados de lá. */
export function LinkSourceForm({ current, onPick, onCancel, confirmLabel = "Mostrar aqui", describe, includeAll }: {
  current?: string; onPick: (db: string, view?: string) => void; onCancel?: () => void;
  confirmLabel?: string; describe?: (f: Found) => ReactNode; includeAll?: boolean;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const seq = useRef(0);
  const all = qc.getQueryData<Listed[]>(["pages"]) ?? [];
  const dbIds = new Set(all.filter((p) => p.is_database).map((p) => p.id));
  // Bancos de verdade (não as tabelas inline vazias dentro de outros bancos) primeiro.
  const dbs = all.filter((p) => p.is_database && p.id !== current && (includeAll || !(p.parent_id && dbIds.has(p.parent_id))));
  const term = text.trim().toLowerCase();
  const listed = parseRef(text) ? [] : dbs.filter((d) => dbLabel(d, all).toLowerCase().includes(term)).slice(0, 8);

  const check = async (value: string) => {
    const mine = ++seq.current;
    if (!parseRef(value)) { setFound(null); setNote(null); setBusy(false); return; }
    setBusy(true);
    const r = await resolveDbRef(value).catch(() => ({ error: "Não foi possível ler esse ID. Tente de novo." }));
    // Só vale a resposta do último texto digitado.
    if (mine !== seq.current) return;
    setBusy(false);
    if ("error" in r) { setFound(null); setNote(r.error); return; }
    if (r.db === current && !r.view) { setFound(null); setNote("Este bloco já mostra esse banco."); return; }
    const cached = all.find((p) => p.id === r.db);
    setNote(null); setFound(cached ? { ...r, title: dbLabel(cached, all) } : r);
  };

  return (
    <div className="space-y-1 p-1 text-sm">
      <input autoFocus aria-label="ID do banco ou da visão" value={text} placeholder="Cole o ID de um banco, visão, coluna ou linha…" className={fieldClass}
        onChange={(e) => { setText(e.target.value); void check(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && found) { e.preventDefault(); onPick(found.db, found.view); }
          if (e.key === "Escape") onCancel?.();
        }} />
      {busy && <p className="px-1 text-xs text-[var(--n-text-faint)]">Procurando esse ID…</p>}
      {note && <p role="alert" className="px-1 text-xs text-orange-600">{note}</p>}
      {found && (
        <div className="rounded border border-[var(--n-border)] p-2 text-xs">
          <p className="mb-1">{describe ? describe(found) : <>Mostrar aqui o banco “{found.title}”{found.viewName ? <>, na visão “{found.viewName}”</> : null}? Os dados são os mesmos de lá: o que mudar aqui muda no banco original.</>}</p>
          <button type="button" onClick={() => onPick(found.db, found.view)} className="rounded bg-[var(--n-accent)] px-2 py-0.5 font-medium text-white">{confirmLabel}</button>
        </div>
      )}
      {!found && listed.length > 0 && <p className="px-1 pt-1 text-[11px] text-[var(--n-text-faint)]">Ou escolha um banco</p>}
      {!found && listed.map((d) => (
        <button key={d.id} type="button" className={menuItem} onClick={() => onPick(d.id)}>
          {d.icon ?? <Database size={14} className="text-[var(--n-text-faint)]" />} <span className="truncate">{dbLabel(d, all)}</span>
        </button>
      ))}
      {onCancel && <button type="button" onClick={onCancel} className="px-1 text-xs text-[var(--n-text-muted)] hover:underline">Cancelar</button>}
    </div>
  );
}
