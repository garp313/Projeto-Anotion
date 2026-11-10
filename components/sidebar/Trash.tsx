"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, FileText, RotateCcw, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Pop, fieldClass } from "@/components/database/ui";

type Archived = { id: string; parent_id: string | null; title: string; icon: string | null; is_database: boolean; updated_at: string };
type Listed = { id: string; title: string };

/** Página arquivada mais tudo que foi arquivado abaixo dela. */
function subtree(all: Archived[], id: string) {
  const ids = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of all) if (p.parent_id && ids.has(p.parent_id) && !ids.has(p.id)) { ids.add(p.id); grew = true; }
  }
  return [...ids];
}

const CHUNK = 100;
const NO_RIGHT = "Só o administrador ou quem criou a página pode apagar de vez.";
const when = (s: string) => new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Apaga em lotes e conta o que saiu: sem permissão o banco não dá erro, só não apaga. */
async function destroyIds(ids: string[]) {
  let gone = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await createClient().from("pages").delete().in("id", ids.slice(i, i + CHUNK)).select("id");
    if (error) throw error;
    gone += data?.length ?? 0;
  }
  return gone;
}

export function Trash({ triggerClass }: { triggerClass: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["trash"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await createClient().from("pages")
        .select("id,parent_id,title,icon,is_database,updated_at").eq("is_archived", true).order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Archived[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["trash"] });
    qc.invalidateQueries({ queryKey: ["pages"] });
    qc.invalidateQueries({ queryKey: ["database_rows"] });
    qc.invalidateQueries({ queryKey: ["page"] });
  };
  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from("pages").update({ is_archived: false }).in("id", subtree(data, id));
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const destroy = useMutation({
    mutationFn: async (ids: string[]) => ({ asked: ids.length, gone: await destroyIds(ids) }),
    onSuccess: ({ asked, gone }) => {
      setConfirming(null);
      setNote(gone === asked ? null : gone ? `${asked - gone} item(ns) ficaram. ${NO_RIGHT}` : NO_RIGHT);
      refresh();
    },
    onError: () => setNote("Não foi possível apagar. Tente de novo."),
  });

  // Onde a página estava: diferencia os vários "Sem título" e as cópias com o mesmo nome.
  const active = qc.getQueryData<Listed[]>(["pages"]) ?? [];
  const origin = (p: Archived) => {
    if (!p.parent_id) return "Raiz do workspace";
    const parent = active.find((x) => x.id === p.parent_id) ?? data.find((x) => x.id === p.parent_id);
    return parent ? `em ${parent.title || "Sem título"}` : "Página de origem excluída";
  };

  const archivedIds = new Set(data.map((p) => p.id));
  const term = q.trim().toLowerCase();
  // Só o topo de cada subárvore arquivada aparece; restaurar traz o resto junto.
  const tops = data.filter((p) => !(p.parent_id && archivedIds.has(p.parent_id)));
  const shown = tops.filter((p) => `${p.title || "Sem título"} ${origin(p)}`.toLowerCase().includes(term));

  return (
    <Pop open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setConfirming(null); setNote(null); } }} width={360} triggerClass={triggerClass} trigger={<><Trash2 size={16} /> Lixeira</>}>
      <div className="flex items-center gap-1 p-1">
        <input aria-label="Buscar na lixeira" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar na lixeira…" className={fieldClass} />
      </div>
      {note && <p role="alert" className="px-2 pb-1 text-xs text-orange-600">{note}</p>}
      {isLoading ? <p className="p-3 text-center text-xs text-[var(--n-text-faint)]">Carregando…</p>
        : !tops.length ? <p className="p-4 text-center text-xs text-[var(--n-text-faint)]">A lixeira está vazia.</p>
        : !shown.length ? <p className="p-4 text-center text-xs text-[var(--n-text-faint)]">Nada encontrado para “{q.trim()}”.</p>
        : <div className="n-scroll max-h-[360px] overflow-y-auto">{shown.map((p) => (
          <div key={p.id} className="flex items-center gap-1 rounded px-2 py-1 hover:bg-[var(--n-hover)]">
            <span className="grid w-5 shrink-0 place-items-center">{p.icon ?? (p.is_database ? <Database size={14} className="text-[var(--n-text-faint)]" /> : <FileText size={14} className="text-[var(--n-text-faint)]" />)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{p.title || "Sem título"}</span>
              <span className="block truncate text-[11px] text-[var(--n-text-faint)]">{origin(p)} · excluída em {when(p.updated_at)}</span>
            </span>
            {confirming === p.id ? (
              <button type="button" disabled={destroy.isPending} onClick={() => destroy.mutate(subtree(data, p.id))} className="rounded bg-red-500 px-1.5 py-0.5 text-xs text-white disabled:opacity-60">Apagar de vez</button>
            ) : (
              <>
                <button type="button" aria-label={`Restaurar ${p.title || "página"}`} title="Restaurar" onClick={() => restore.mutate(p.id)} className="rounded p-1 hover:bg-[var(--n-active)]"><RotateCcw size={13} /></button>
                <button type="button" aria-label={`Apagar ${p.title || "página"} definitivamente`} title="Apagar definitivamente" onClick={() => setConfirming(p.id)} className="rounded p-1 text-red-500 hover:bg-[var(--n-active)]"><Trash2 size={13} /></button>
              </>
            )}
          </div>
        ))}</div>}
      {tops.length > 0 && (
        <div className="mt-1 flex items-center gap-2 border-t border-[var(--n-border)] px-2 pt-1.5 text-xs">
          <span className="text-[var(--n-text-faint)]">{tops.length} na lixeira</span>
          {confirming === "__all" ? (
            <span className="ml-auto flex items-center gap-1">
              <span>Apagar tudo de vez?</span>
              <button type="button" disabled={destroy.isPending} onClick={() => destroy.mutate(data.map((p) => p.id))} className="rounded bg-red-500 px-1.5 py-0.5 text-white disabled:opacity-60">Esvaziar</button>
              <button type="button" onClick={() => setConfirming(null)} className="rounded px-1.5 py-0.5 hover:bg-[var(--n-hover)]">Cancelar</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirming("__all")} className="ml-auto rounded px-1.5 py-0.5 text-red-500 hover:bg-[var(--n-hover)]">Esvaziar lixeira</button>
          )}
        </div>
      )}
    </Pop>
  );
}
