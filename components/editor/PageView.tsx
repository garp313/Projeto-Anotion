"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, Kanban, List, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usePageTree, type PageFull } from "@/lib/hooks/usePageTree";
import type { SaveStatus } from "@/lib/hooks/useAutoSave";
import { PageHeader } from "./PageHeader";
import { BlockEditor } from "./BlockEditor";
import { DatabaseView } from "@/components/database/DatabaseView";

const LABEL: Record<SaveStatus, string> = { saved: "Salvo", saving: "Salvando…", error: "Erro ao salvar" };

export function PageView({ pageId }: { pageId: string }) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const { updatePage } = usePageTree();

  const { data: page, isLoading, error } = useQuery({
    queryKey: ["page", pageId],
    queryFn: async () => {
      const { data, error } = await createClient().from("pages").select("*").eq("id", pageId).single();
      if (error) throw error;
      return data as PageFull;
    },
    staleTime: Infinity, // o editor é a fonte da verdade enquanto a página está aberta
  });

  if (isLoading) return <div className="p-12 text-sm text-[var(--n-text-faint)]">Carregando…</div>;
  if (error || !page) return <div className="grid h-full place-items-center text-[var(--n-text-muted)]">Página não encontrada.</div>;

  const isBlank = !page.content_json || page.content_json.length === 0;

  return (
    <article>
      <div className="sticky top-0 z-20 flex h-11 items-center justify-end bg-[var(--n-bg)]/80 px-4 text-xs text-[var(--n-text-faint)] backdrop-blur">
        <span aria-live="polite">{LABEL[status]}</span>
      </div>
      <div className="-mt-11"><PageHeader page={page} /></div>

      <div
        className={`mx-auto w-full pb-40 px-4 sm:px-8 transition-all ${
          page.is_database ? "max-w-[1600px]" : "max-w-[960px]"
        }`}
      >
        {page.is_database ? (
          <div className="mt-4">
            <DatabaseView
              databaseId={page.id}
              initialSchema={page.database_schema}
            />
          </div>
        ) : (
          <>
            {isBlank && (
              <div className="mb-6 flex flex-wrap items-center gap-2 pt-2 text-xs text-[var(--n-text-muted)]">
                <span className="text-[var(--n-text-faint)]">Criar como:</span>
                <button
                  onClick={() => updatePage.mutate({ id: page.id, patch: { is_database: true } })}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--n-border)] px-2.5 py-1 transition-colors hover:bg-[var(--n-hover)]"
                >
                  <Table size={14} className="text-blue-500" /> Tabela
                </button>
                <button
                  onClick={() => updatePage.mutate({ id: page.id, patch: { is_database: true } })}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--n-border)] px-2.5 py-1 transition-colors hover:bg-[var(--n-hover)]"
                >
                  <Kanban size={14} className="text-orange-500" /> Quadro
                </button>
                <button
                  onClick={() => updatePage.mutate({ id: page.id, patch: { is_database: true } })}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--n-border)] px-2.5 py-1 transition-colors hover:bg-[var(--n-hover)]"
                >
                  <List size={14} className="text-green-500" /> Lista
                </button>
              </div>
            )}
            <BlockEditor
              key={page.id}
              pageId={page.id}
              initialContent={page.content_json}
              onStatus={setStatus}
            />
          </>
        )}
      </div>
    </article>
  );
}
