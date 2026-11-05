"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { memberName, notMigrated, useMembers } from "@/lib/collab";
import type { PageFull } from "@/lib/hooks/usePageTree";
import { Pop, menuItem } from "@/components/database/ui";

type Version = { id: string; title: string; content_json: any[]; created_by: string | null; created_at: string };

function List({ pageId, onRestored }: { pageId: string; onRestored: () => void }) {
  const qc = useQueryClient();
  const supabase = createClient();
  const { data: members = [] } = useMembers();
  const versions = useQuery({
    queryKey: ["versions", pageId],
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("page_versions").select("id,title,content_json,created_by,created_at")
        .eq("page_id", pageId).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data as Version[];
    },
  });
  const restore = useMutation({
    mutationFn: async (v: Version) => {
      const { error } = await supabase.from("pages").update({ title: v.title, content_json: v.content_json }).eq("id", pageId);
      if (error) throw error;
      return v;
    },
    onSuccess: (v) => {
      qc.setQueryData<PageFull>(["page", pageId], (old) => (old ? { ...old, title: v.title, content_json: v.content_json } : old));
      qc.invalidateQueries({ queryKey: ["pages"] });
      qc.invalidateQueries({ queryKey: ["versions", pageId] });
      // A restauração muda a versão do texto: sem buscar a nova, o próximo salvamento daria conflito.
      void qc.refetchQueries({ queryKey: ["page", pageId] }).then(onRestored);
    },
  });
  if (notMigrated(versions.error as any)) return <p className="p-2 text-xs text-[var(--n-text-muted)]">O histórico fica disponível depois de rodar a migration 0003.</p>;
  if (!versions.data?.length) return <p className="p-2 text-xs text-[var(--n-text-muted)]">{versions.isLoading ? "Carregando…" : "Ainda não há versões. Uma é guardada a cada 10 minutos de edição."}</p>;
  const by = (id: string | null) => { const m = members.find((x) => x.id === id); return m ? memberName(m) : "Alguém"; };
  return (
    <>
      <p className="px-2 py-1 text-[11px] text-[var(--n-text-faint)]">Clique numa versão para restaurar</p>
      {versions.data.map((v) => (
        <button key={v.id} type="button" disabled={restore.isPending} className={menuItem} onClick={() => restore.mutate(v)}>
          <span className="min-w-0">
            <span className="block truncate">{new Date(v.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
            <span className="block truncate text-xs text-[var(--n-text-faint)]">{by(v.created_by)} · {v.title || "Sem título"}</span>
          </span>
        </button>
      ))}
      {restore.isError && <p role="alert" className="px-2 py-1 text-xs text-red-500">Não foi possível restaurar.</p>}
    </>
  );
}

export function VersionsMenu({ pageId, onRestored }: { pageId: string; onRestored: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Pop open={open} onOpenChange={setOpen} width={280} align="end" triggerClass="shrink-0 rounded p-1 hover:bg-[var(--n-hover)]"
      trigger={<History size={14} aria-label="Histórico de versões" />}>
      {open && <List pageId={pageId} onRestored={() => { setOpen(false); onRestored(); }} />}
    </Pop>
  );
}
