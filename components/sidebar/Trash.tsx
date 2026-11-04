"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, RotateCcw, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Pop, fieldClass } from "@/components/database/ui";

type Archived = { id: string; parent_id: string | null; title: string; icon: string | null; updated_at: string };

/** Página arquivada mais tudo que foi arquivado abaixo dela. */
function subtree(all: Archived[], id: string) {
  const ids = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of all) if (p.parent_id && ids.has(p.parent_id) && !ids.has(p.id)) { ids.add(p.id); grew = true; }
  }
  return [...ids];
}

export function Trash({ triggerClass }: { triggerClass: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["trash"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await createClient().from("pages")
        .select("id,parent_id,title,icon,updated_at").eq("is_archived", true).order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Archived[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["trash"] });
    qc.invalidateQueries({ queryKey: ["pages"] });
    qc.invalidateQueries({ queryKey: ["database_rows"] });
  };
  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from("pages").update({ is_archived: false }).in("id", subtree(data, id));
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const destroy = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from("pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { setConfirming(null); refresh(); },
  });

  const archivedIds = new Set(data.map((p) => p.id));
  const term = q.trim().toLowerCase();
  // Só o topo de cada subárvore arquivada aparece; restaurar traz o resto junto.
  const shown = data.filter((p) => !(p.parent_id && archivedIds.has(p.parent_id)) && (p.title || "Sem título").toLowerCase().includes(term));

  return (
    <Pop open={open} onOpenChange={setOpen} width={340} triggerClass={triggerClass} trigger={<><Trash2 size={16} /> Lixeira</>}>
      <div className="p-1"><input aria-label="Buscar na lixeira" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar na lixeira…" className={fieldClass} /></div>
      {isLoading ? <p className="p-3 text-center text-xs text-[var(--n-text-faint)]">Carregando…</p>
        : !shown.length ? <p className="p-4 text-center text-xs text-[var(--n-text-faint)]">A lixeira está vazia.</p>
        : shown.map((p) => (
          <div key={p.id} className="flex items-center gap-1 rounded px-2 py-1 hover:bg-[var(--n-hover)]">
            <span className="grid w-5 shrink-0 place-items-center">{p.icon ?? <FileText size={14} className="text-[var(--n-text-faint)]" />}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{p.title || "Sem título"}</span>
            {confirming === p.id ? (
              <button type="button" onClick={() => destroy.mutate(p.id)} className="rounded bg-red-500 px-1.5 py-0.5 text-xs text-white">Apagar de vez</button>
            ) : (
              <>
                <button type="button" aria-label={`Restaurar ${p.title || "página"}`} title="Restaurar" onClick={() => restore.mutate(p.id)} className="rounded p-1 hover:bg-[var(--n-active)]"><RotateCcw size={13} /></button>
                <button type="button" aria-label={`Apagar ${p.title || "página"} definitivamente`} title="Apagar definitivamente" onClick={() => setConfirming(p.id)} className="rounded p-1 text-red-500 hover:bg-[var(--n-active)]"><Trash2 size={13} /></button>
              </>
            )}
          </div>
        ))}
    </Pop>
  );
}
