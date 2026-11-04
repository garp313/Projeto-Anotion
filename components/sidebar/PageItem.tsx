"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight, FileText, MoreHorizontal, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchPage, usePageTree, type TreeNode } from "@/lib/hooks/usePageTree";
import { Pop } from "@/components/database/ui";
import { PageMenu } from "./PageMenu";

const contains = (n: TreeNode, id?: string): boolean => n.children.some((c) => c.id === id || contains(c, id));

type DropPosition = "before" | "inside" | "after" | null;

type Props = {
  node: TreeNode;
  depth: number;
  onCreate: (parentId: string) => void;
  onMove: (draggedId: string, parentId: string | null, position: number) => void;
};

export function PageItem({ node, depth, onCreate, onMove }: Props) {
  const { pageId } = useParams<{ pageId?: string }>();
  const [open, setOpen] = useState(false);
  const [dropPosition, setDropPosition] = useState<DropPosition>(null);
  const [isDragging, setIsDragging] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const { updatePage } = usePageTree();
  const active = pageId === node.id;
  const qc = useQueryClient();
  // Abre os ancestrais para a página atual sempre estar visível e destacada.
  const holdsActive = contains(node, pageId);
  useEffect(() => { if (holdsActive) setOpen(true); }, [holdsActive]);
  const hasChildren = node.children.length > 0;

  const action = "grid h-5 w-5 place-items-center rounded text-[var(--n-text-muted)] hover:bg-[var(--n-active)]";

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", node.id);
    e.dataTransfer.effectAllowed = "move";
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDropPosition(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!rowRef.current) return;
    const rect = rowRef.current.getBoundingClientRect();
    const clientY = e.clientY;
    const topQuarter = rect.top + rect.height * 0.25;
    const bottomQuarter = rect.bottom - rect.height * 0.25;

    if (clientY < topQuarter) {
      setDropPosition("before");
    } else if (clientY > bottomQuarter) {
      setDropPosition("after");
    } else {
      setDropPosition("inside");
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropPosition(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData("text/plain");

    if (!draggedId || draggedId === node.id) {
      setDropPosition(null);
      return;
    }

    if (dropPosition === "inside") {
      setOpen(true);
      onMove(draggedId, node.id, Date.now());
    } else if (dropPosition === "before") {
      onMove(draggedId, node.parent_id, node.position - 0.5);
    } else if (dropPosition === "after") {
      onMove(draggedId, node.parent_id, node.position + 0.5);
    }

    setDropPosition(null);
  };

  let dropBorderClass = "";
  if (dropPosition === "before") {
    dropBorderClass = "border-t-2 border-[var(--n-accent)]";
  } else if (dropPosition === "after") {
    dropBorderClass = "border-b-2 border-[var(--n-accent)]";
  } else if (dropPosition === "inside") {
    dropBorderClass = "bg-[var(--n-accent)]/15 ring-1 ring-[var(--n-accent)]/50";
  }

  return (
    <div className="relative select-none">
      <div
        ref={rowRef}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`group flex h-[27px] cursor-pointer items-center gap-0.5 rounded pr-1 text-sm transition-colors ${
          isDragging ? "opacity-40" : ""
        } ${active ? "bg-[var(--n-active)] font-medium" : "hover:bg-[var(--n-hover)]"} ${dropBorderClass}`}
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        <button
          aria-label={open ? "Recolher" : "Expandir"}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className={`${action} shrink-0`}
        >
          <ChevronRight
            size={14}
            className={`transition-transform ${open ? "rotate-90" : ""} ${hasChildren ? "" : "opacity-40"}`}
          />
        </button>

        {renaming ? (
          <input
            autoFocus defaultValue={node.title} aria-label="Novo nome" onClick={(e) => e.stopPropagation()}
            onBlur={(e) => { setRenaming(false); if (e.target.value !== node.title) updatePage.mutate({ id: node.id, patch: { title: e.target.value } }); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.currentTarget.value = node.title; e.currentTarget.blur(); } }}
            className="min-w-0 flex-1 rounded border border-[var(--n-accent)] bg-transparent px-1 text-sm outline-none"
          />
        ) : (
          <Link href={`/workspace/${node.id}`} className="flex min-w-0 flex-1 items-center gap-1.5"
            onMouseEnter={() => void qc.prefetchQuery({ queryKey: ["page", node.id], queryFn: () => fetchPage(node.id), staleTime: Infinity })}>
            <span className="grid w-5 shrink-0 place-items-center text-[15px]">
              {node.icon ?? <FileText size={16} className="text-[var(--n-text-muted)]" />}
            </span>
            <span className={`truncate ${node.title ? "" : "text-[var(--n-text-faint)]"}`}>
              {node.title || "Sem título"}
            </span>
          </Link>
        )}

        <div data-open={menuOpen} className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 data-[open=true]:opacity-100">
          <Pop open={menuOpen} onOpenChange={setMenuOpen} width={230} triggerClass={action} trigger={<MoreHorizontal size={14} aria-label="Mais opções" />}>
            <PageMenu pageId={node.id} onClose={() => setMenuOpen(false)} onRename={() => { setMenuOpen(false); setRenaming(true); }} />
          </Pop>

          <button
            aria-label="Adicionar subpágina"
            className={action}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
              onCreate(node.id);
            }}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {open && (
        hasChildren ? (
          node.children.map((c) => (
            <PageItem
              key={c.id}
              node={c}
              depth={depth + 1}
              onCreate={onCreate}
              onMove={onMove}
            />
          ))
        ) : (
          <p
            className="py-1 text-xs text-[var(--n-text-faint)]"
            style={{ paddingLeft: 34 + depth * 12 }}
          >
            Sem subpáginas
          </p>
        )
      )}
    </div>
  );
}
