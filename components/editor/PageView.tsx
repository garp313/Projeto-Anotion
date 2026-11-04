"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronsLeftRight, Table, Kanban, List, ListChecks } from "lucide-react";
import { fetchPage, usePageTree } from "@/lib/hooks/usePageTree";
import type { SaveStatus } from "@/lib/hooks/useAutoSave";
import { databasePatch, type ViewType } from "@/components/database/types";
import { createTaskTemplate } from "@/lib/tasks";
import { PageHeader } from "./PageHeader";
import { PageSkeleton } from "./PageSkeleton";

// Editor e banco de dados são os trechos mais pesados: cada página baixa só o que usa.
const skeleton = () => <div className="h-40 animate-pulse rounded bg-[var(--n-hover)]/40" />;
const BlockEditor = dynamic(() => import("./BlockEditor").then((m) => m.BlockEditor), { ssr: false, loading: skeleton });
const DatabaseView = dynamic(() => import("@/components/database/DatabaseView").then((m) => m.DatabaseView), { ssr: false, loading: skeleton });
const RowProperties = dynamic(() => import("@/components/database/RowProperties").then((m) => m.RowProperties), { ssr: false });

const LABEL: Record<SaveStatus, string> = { saved: "Salvo", saving: "Salvando…", error: "Erro ao salvar" };

export function PageView({ pageId }: { pageId: string }) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const { updatePage, pages } = usePageTree();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: page, isLoading, error } = useQuery({
    queryKey: ["page", pageId],
    queryFn: () => fetchPage(pageId),
    staleTime: Infinity, // o editor é a fonte da verdade enquanto a página está aberta
  });

  // Ancestrais para o breadcrumb, do topo até o pai.
  const trail = useMemo(() => {
    const byId = new Map((pages.data ?? []).map((p) => [p.id, p]));
    const out = [];
    for (let p = page?.parent_id ? byId.get(page.parent_id) : undefined; p && out.length < 8; p = p.parent_id ? byId.get(p.parent_id) : undefined) out.unshift(p);
    return out;
  }, [pages.data, page?.parent_id]);

  if (isLoading) return <PageSkeleton />;
  if (error || !page) return <div className="grid h-full place-items-center text-[var(--n-text-muted)]">Página não encontrada.</div>;

  const isBlank = !page.content_json || page.content_json.length === 0;
  const parentIsDatabase = pages.data?.some((p) => p.id === page.parent_id && p.is_database);
  const fullWidth = Boolean(page.row_properties?.__fullWidth);
  const useTemplate = async () => {
    const id = await createTaskTemplate(page.workspace_id);
    qc.invalidateQueries({ queryKey: ["pages"] });
    router.push(`/workspace/${id}`);
  };
  const makeDatabase = (type: ViewType) => updatePage.mutate({ id: page.id, patch: databasePatch(page, type) });

  return (
    <article>
      <div className="sticky top-0 z-30 flex h-11 items-center gap-3 bg-[var(--n-bg)]/80 px-4 pl-11 text-xs text-[var(--n-text-faint)] backdrop-blur">
        <nav aria-label="Caminho da página" className="flex min-w-0 flex-1 items-center gap-1 text-sm text-[var(--n-text-muted)]">
          {trail.map((p) => (
            <span key={p.id} className="flex min-w-0 items-center gap-1">
              <Link href={`/workspace/${p.id}`} className="truncate rounded px-1 hover:bg-[var(--n-hover)]">{p.icon} {p.title || "Sem título"}</Link>
              <span className="text-[var(--n-text-faint)]">/</span>
            </span>
          ))}
          <span aria-current="page" className="truncate px-1 text-[var(--n-text)]">{page.icon} {page.title || "Sem título"}</span>
        </nav>
        <button type="button" aria-pressed={fullWidth} title="Largura total"
          onClick={() => updatePage.mutate({ id: page.id, patch: { row_properties: { ...page.row_properties, __fullWidth: !fullWidth } } })}
          className={`flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[var(--n-hover)] ${fullWidth ? "text-[var(--n-accent)]" : ""}`}>
          <ChevronsLeftRight size={13} /> Largura total
        </button>
        <span aria-live="polite" className="shrink-0">{LABEL[status]}</span>
      </div>
      <div className="-mt-11"><PageHeader page={page} fullWidth={fullWidth} /></div>

      <div className={`mx-auto w-full pb-40 px-6 sm:px-12 ${fullWidth ? "" : "max-w-[960px]"}`}>
        {parentIsDatabase && <RowProperties databaseId={page.parent_id!} rowId={page.id} />}
        {page.is_database ? (
          <div className="mt-4">
            <DatabaseView databaseId={page.id} />
          </div>
        ) : (
          <>
            {isBlank && !parentIsDatabase && (
              <div className="mb-6 flex flex-wrap items-center gap-2 pt-2 text-xs text-[var(--n-text-muted)]">
                <span className="text-[var(--n-text-faint)]">Criar como:</span>
                <button
                  onClick={() => makeDatabase("table")}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--n-border)] px-2.5 py-1 transition-colors hover:bg-[var(--n-hover)]"
                >
                  <Table size={14} className="text-blue-500" /> Tabela
                </button>
                <button
                  onClick={() => makeDatabase("board")}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--n-border)] px-2.5 py-1 transition-colors hover:bg-[var(--n-hover)]"
                >
                  <Kanban size={14} className="text-orange-500" /> Quadro
                </button>
                <button
                  onClick={() => makeDatabase("list")}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--n-border)] px-2.5 py-1 transition-colors hover:bg-[var(--n-hover)]"
                >
                  <List size={14} className="text-green-500" /> Lista
                </button>
                <button onClick={useTemplate}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--n-border)] px-2.5 py-1 transition-colors hover:bg-[var(--n-hover)]">
                  <ListChecks size={14} className="text-purple-500" /> Tarefas e Projetos
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
