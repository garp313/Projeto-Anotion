"use client";
import { useState } from "react";
import type { TreeNode } from "@/lib/hooks/usePageTree";
import { PageItem } from "./PageItem";

export function PageTree({
  tree,
  onCreate,
  onMove,
}: {
  tree: TreeNode[];
  onCreate: (parentId: string) => void;
  onMove: (draggedId: string, parentId: string | null, position: number) => void;
}) {
  const [rootDropOver, setRootDropOver] = useState(false);

  const handleRootDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setRootDropOver(true);
  };

  const handleRootDragLeave = () => {
    setRootDropOver(false);
  };

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setRootDropOver(false);
    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId) return;
    const lastRoot = tree[tree.length - 1];
    const newPos = lastRoot ? lastRoot.position + 1 : Date.now();
    onMove(draggedId, null, newPos);
  };

  return (
    <nav aria-label="Páginas" className="space-y-px">
      {tree.map((n) => (
        <PageItem
          key={n.id}
          node={n}
          depth={0}
          onCreate={onCreate}
          onMove={onMove}
        />
      ))}

      {/* Drop zone to move to root level */}
      <div
        onDragOver={handleRootDragOver}
        onDragLeave={handleRootDragLeave}
        onDrop={handleRootDrop}
        className={`h-4 w-full rounded transition-colors ${
          rootDropOver ? "bg-[var(--n-accent)]/20 border border-dashed border-[var(--n-accent)]" : ""
        }`}
      />
    </nav>
  );
}
