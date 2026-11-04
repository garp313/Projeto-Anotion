"use client";
import { useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ColumnSchema } from "@/components/database/types";

export type PageRow = {
  id: string; workspace_id: string; parent_id: string | null;
  title: string; icon: string | null; cover: string | null;
  position: number; is_database: boolean;
};
export type PageFull = PageRow & {
  content_json: any[];
  database_schema?: ColumnSchema[];
  row_properties?: Record<string, any>;
};
export type TreeNode = PageRow & { children: TreeNode[] };

const LIST = "id,workspace_id,parent_id,title,icon,cover,position,is_database";

export async function fetchPage(id: string): Promise<PageFull> {
  const { data, error } = await createClient().from("pages").select("*").eq("id", id).single();
  if (error) throw error;
  return data as PageFull;
}

export function buildTree(rows: PageRow[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  rows.forEach((r) => map.set(r.id, { ...r, children: [] }));
  const roots: TreeNode[] = [];
  map.forEach((n) => {
    const parent = n.parent_id ? map.get(n.parent_id) : null;
    (parent ? parent.children : roots).push(n);
  });
  const sort = (l: TreeNode[]) => { l.sort((a, b) => a.position - b.position); l.forEach((n) => sort(n.children)); };
  sort(roots);
  return roots;
}

export function usePageTree() {
  const supabase = useRef(createClient()).current;
  const qc = useQueryClient();
  const router = useRouter();

  const workspace = useQuery({
    queryKey: ["workspace"],
    queryFn: async () => {
      const { data, error } = await supabase.from("workspaces").select("id,name").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  const pages = useQuery({
    queryKey: ["pages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pages").select(LIST).eq("is_archived", false).order("position");
      if (error) throw error;
      return data as PageRow[];
    },
  });

  const tree = useMemo(() => buildTree(pages.data ?? []), [pages.data]);

  const createPage = useMutation({
    mutationFn: async (parentId: string | null = null) => {
      const { data, error } = await supabase
        .from("pages")
        .insert({ workspace_id: workspace.data!.id, parent_id: parentId, position: Date.now() })
        .select(LIST).single();
      if (error) throw error;
      return data as PageRow;
    },
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ["pages"] }); router.push(`/workspace/${p.id}`); },
  });

  const updatePage = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<PageFull> }) => {
      const { error } = await supabase.from("pages").update(patch).eq("id", id);
      if (error) throw error;
    },
    // otimista: a sidebar muda no mesmo instante em que o título é digitado
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["pages"] });
      const prev = qc.getQueryData<PageRow[]>(["pages"]);
      qc.setQueryData<PageRow[]>(["pages"], (old) => old?.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      qc.setQueryData<PageFull>(["page", id], (old) => (old ? { ...old, ...patch } : old));
      // mantém a tabela em dia quando a linha é editada na própria página
      qc.setQueriesData<any[]>({ queryKey: ["database_rows"] }, (old) => old?.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(["pages"], ctx.prev),
  });

  const archivePage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pages").update({ is_archived: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pages"] }); router.push("/workspace"); },
  });

  const movePage = useMutation({
    mutationFn: async ({ id, parentId, position }: { id: string; parentId: string | null; position: number }) => {
      const { error } = await supabase.from("pages").update({ parent_id: parentId, position }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, parentId, position }) => {
      await qc.cancelQueries({ queryKey: ["pages"] });
      const prev = qc.getQueryData<PageRow[]>(["pages"]);
      qc.setQueryData<PageRow[]>(["pages"], (old) =>
        old?.map((p) => (p.id === id ? { ...p, parent_id: parentId, position } : p))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(["pages"], ctx.prev),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["pages"] });
    },
  });

  return { workspace, pages, tree, createPage, updatePage, archivePage, movePage };
}
