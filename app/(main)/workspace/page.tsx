"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { usePageTree } from "@/lib/hooks/usePageTree";

export default function WorkspaceHome() {
  const router = useRouter();
  const { tree, pages, workspace, createPage } = usePageTree();

  useEffect(() => {
    if (tree[0]) router.replace(`/workspace/${tree[0].id}`);
  }, [tree, router]);

  if (pages.isLoading || workspace.isLoading || tree[0]) return null;

  return (
    <div className="grid h-full place-items-center">
      <div className="text-center">
        <p className="mb-3 text-[var(--n-text-muted)]">Você ainda não tem páginas.</p>
        <button onClick={() => createPage.mutate(null)}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--n-accent)] px-3 py-1.5 text-sm font-medium text-white hover:brightness-95">
          <FilePlus2 size={16} /> Criar primeira página
        </button>
      </div>
    </div>
  );
}
