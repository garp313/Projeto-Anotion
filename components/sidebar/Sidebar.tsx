"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { CalendarDays, ChevronsLeft, ListChecks, Menu, Plus, Search } from "lucide-react";
import { useSidebar } from "@/lib/store/sidebar";
import { useEmptyPageCleanup } from "@/lib/hooks/useEmptyPageCleanup";
import { usePageTree } from "@/lib/hooks/usePageTree";
import { PageTree } from "./PageTree";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export function Sidebar() {
  const { collapsed, width, toggle, setWidth } = useSidebar();
  const { tree, pages, workspace, createPage, archivePage, movePage } = usePageTree();
  const dragging = useRef(false);
  useEmptyPageCleanup(pages.data);

  // Ctrl+\ (ou Cmd+\)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "\\") { e.preventDefault(); toggle(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  // arrastar a borda direita
  useEffect(() => {
    const move = (e: PointerEvent) => dragging.current && setWidth(e.clientX);
    const up = () => { dragging.current = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [setWidth]);

  const row = "flex h-[27px] w-full items-center gap-2 rounded px-2 text-sm text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]";

  return (
    <>
      {collapsed && (
        <button aria-label="Abrir barra lateral (Ctrl+\)" onClick={toggle}
          className="fixed left-2 top-2 z-30 grid h-7 w-7 place-items-center rounded text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]">
          <Menu size={16} />
        </button>
      )}
      <aside
        aria-hidden={collapsed}
        style={{ width: collapsed ? 0 : width }}
        className="relative shrink-0 overflow-hidden bg-[var(--n-bg-sidebar)] transition-[width] duration-200 ease-out data-[drag=true]:transition-none"
      >
        <div style={{ width }} className="flex h-full flex-col">
          <div className="flex items-center gap-1 p-1.5 pb-0">
            <div className="min-w-0 flex-1"><WorkspaceSwitcher name={workspace.data?.name} /></div>
            <button aria-label="Fechar barra lateral" onClick={toggle} className="grid h-6 w-6 place-items-center rounded text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]">
              <ChevronsLeft size={16} />
            </button>
          </div>

          <div className="space-y-px px-1.5 py-1">
            <button className={row} onClick={() => window.dispatchEvent(new CustomEvent("open-search"))}>
              <Search size={16} /> Buscar <kbd className="ml-auto text-xs text-[var(--n-text-faint)]">Ctrl K</kbd>
            </button>
            <Link href="/tarefas" className={row}><ListChecks size={16} /> Minhas tarefas</Link>
            <Link href="/agenda" className={row}><CalendarDays size={16} /> Agenda</Link>
          </div>

          <div className="n-scroll flex-1 overflow-y-auto px-1.5 pb-2">
            <div className="group flex items-center px-2 pb-1 pt-3 text-xs font-medium text-[var(--n-text-faint)]">
              Páginas
              <button aria-label="Nova página" onClick={() => createPage.mutate(null)}
                className="ml-auto grid h-5 w-5 place-items-center rounded opacity-0 hover:bg-[var(--n-active)] group-hover:opacity-100">
                <Plus size={14} />
              </button>
            </div>
            {pages.isLoading
              ? <div className="space-y-1 px-2">{[70, 55, 80].map((w) => <div key={w} style={{ width: `${w}%` }} className="h-4 animate-pulse rounded bg-[var(--n-hover)]" />)}</div>
              : <PageTree
                  tree={tree}
                  onCreate={(id) => createPage.mutate(id)}
                  onArchive={(id) => archivePage.mutate(id)}
                  onMove={(id, parentId, position) => movePage.mutate({ id, parentId, position })}
                />}
          </div>

          <div className="border-t border-[var(--n-border)] p-1.5">
            <button className={row} onClick={() => createPage.mutate(null)}><Plus size={16} /> Nova página</button>
          </div>
        </div>

        {!collapsed && (
          <div
            role="separator" aria-orientation="vertical" aria-label="Redimensionar barra lateral"
            onPointerDown={() => { dragging.current = true; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }}
            onDoubleClick={() => setWidth(260)}
            className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-[var(--n-accent)]/40 active:bg-[var(--n-accent)]/60"
          />
        )}
      </aside>
    </>
  );
}
