"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { PageRow } from "./usePageTree";

/** Espera o autosave da página que acabou de ser fechada chegar ao banco antes de avaliar. */
const SETTLE_MS = 3000;
/** Página recém-criada ainda está sendo preenchida, mesmo que esteja vazia. */
const MIN_AGE_MS = 30_000;

const isBlankValue = (v: unknown) =>
  v === null || v === undefined || v === "" || v === false || (Array.isArray(v) && v.length === 0);

const isBlankBlock = (b: any): boolean =>
  b?.type === "paragraph" &&
  !(Array.isArray(b.content) ? b.content : []).some((c: any) => c?.text?.trim() || (c?.type && c.type !== "text")) &&
  (b.children ?? []).every(isBlankBlock);

type Candidate = { id: string; parent_id: string | null; created_at: string; created_by?: string | null; is_database?: boolean; icon: string | null; cover: string | null; content_json: any[] | null; row_properties: Record<string, unknown> | null };

function isEmptyPage(p: Candidate) {
  return !p.icon && !p.cover
    && (p.content_json ?? []).every(isBlankBlock)
    // Chaves "__" são da página (visões, largura), não conteúdo: banco vazio tem __views.
    && Object.entries(p.row_properties ?? {}).every(([k, v]) => k.startsWith("__") || isBlankValue(v));
}

/**
 * Arquiva páginas e linhas que ficaram sem nada ao sair delas, como o "Sem título" deixado por um
 * clique em "Nova página". É um arquivamento (is_archived), não uma exclusão: pode ser desfeito no banco.
 */
export function useEmptyPageCleanup(pages: PageRow[] | undefined) {
  const pathname = usePathname();
  const qc = useQueryClient();
  const latest = useRef(pages);
  latest.current = pages;
  const ready = Boolean(pages);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const find = (cols: string) => supabase.from("pages").select(cols).eq("title", "").eq("is_archived", false);
      const base = "id,parent_id,created_at,is_database,icon,cover,content_json,row_properties";
      let { data, error } = await find(`${base},created_by`);
      if (error?.code === "42703") ({ data, error } = await find(base));
      if (error || !data?.length) return;
      const { data: auth } = await supabase.auth.getSession();
      const me = auth.session?.user.id;

      const current = window.location.pathname.split("/").pop();
      const hasChildren = new Set((latest.current ?? []).map((p) => p.parent_id));
      const ids = (data as unknown as Candidate[])
        // Workspace compartilhado: quem abriu uma página nova agora pode estar nela. Cada um limpa as suas.
        .filter((p) => (!p.created_by || p.created_by === me) && p.id !== current && p.parent_id !== current && !hasChildren.has(p.id)
          && Date.now() - new Date(p.created_at).getTime() > MIN_AGE_MS && isEmptyPage(p))
        .map((p) => p.id);
      if (!ids.length) return;

      const { error: archiveError } = await supabase.from("pages").update({ is_archived: true }).in("id", ids);
      if (archiveError) return;
      qc.invalidateQueries({ queryKey: ["pages"] });
      qc.invalidateQueries({ queryKey: ["database_rows"] });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [pathname, ready, qc]);
}
