"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays, ChevronsLeft, FileText, ListChecks, Menu, Plus, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { connectGoogle, useGoogleStatus, useUnreadCount } from "@/lib/collab";
import { useSidebar } from "@/lib/store/sidebar";
import { useEmptyPageCleanup } from "@/lib/hooks/useEmptyPageCleanup";
import { useFavorites, useRecents } from "@/lib/hooks/useFavorites";
import { usePageTree } from "@/lib/hooks/usePageTree";
import { PageTree } from "./PageTree";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { Trash } from "./Trash";

export function Sidebar() {
  const { collapsed, width, toggle, setWidth } = useSidebar();
  const { tree, pages, workspace, createPage, movePage } = usePageTree();
  const { favorites } = useFavorites();
  const recents = useRecents();
  const { data: unread = 0 } = useUnreadCount();
  const { data: google } = useGoogleStatus();
  const qc = useQueryClient();
  // Convites feitos antes de a pessoa ter conta valem a partir do primeiro login.
  useEffect(() => {
    createClient().rpc("accept_invites").then(({ data }) => { if (data) { qc.invalidateQueries({ queryKey: ["pages"] }); qc.invalidateQueries({ queryKey: ["members"] }); } });
  }, [qc]);
  const byId = useMemo(() => new Map((pages.data ?? []).map((p) => [p.id, p])), [pages.data]);
  const quick = (label: string, ids: string[], empty?: string) => {
    const list = ids.map((id) => byId.get(id)).filter((p) => p !== undefined);
    if (!list.length && !empty) return null;
    return (
      <section aria-label={label}>
        <div className="px-2 pb-1 pt-3 text-xs font-medium text-[var(--n-text-faint)]">{label}</div>
        {!list.length && <p className="px-2 text-xs text-[var(--n-text-faint)]">{empty}</p>}
        {list.map((p) => (
          <Link key={p.id} href={`/workspace/${p.id}`} className="flex h-[27px] items-center gap-1.5 rounded px-2 text-sm text-[var(--n-text-muted)] hover:bg-[var(--n-hover)] max-md:h-10">
            <span className="grid w-5 shrink-0 place-items-center text-[15px]">{p.icon ?? <FileText size={15} />}</span>
            <span className="truncate">{p.title || "Sem título"}</span>
          </Link>
        ))}
      </section>
    );
  };
  const dragging = useRef(false);
  // No celular a barra vira gaveta sobre o conteúdo: fixa, ela deixava 130px para a página.
  const [mobile, setMobile] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    const query = matchMedia("(max-width: 767px)");
    const sync = () => setMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const wasMobile = useRef(false);
  useEffect(() => {
    // Recolher é automático no celular: voltar ao tamanho normal não pode deixar a barra escondida.
    if (mobile) useSidebar.setState({ collapsed: true });
    else if (wasMobile.current) useSidebar.setState({ collapsed: false });
    wasMobile.current = mobile;
  }, [mobile, pathname]);
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

  const row = "flex h-[27px] w-full items-center gap-2 rounded px-2 text-sm text-[var(--n-text-muted)] hover:bg-[var(--n-hover)] max-md:h-10";

  return (
    <>
      {collapsed && (
        <button aria-label="Abrir barra lateral (Ctrl+\)" onClick={toggle}
          className="fixed left-2 top-2 z-40 grid h-7 w-7 place-items-center rounded text-[var(--n-text-muted)] hover:bg-[var(--n-hover)] max-md:h-9 max-md:w-9">
          <Menu size={16} />
        </button>
      )}
      {mobile && !collapsed && <button type="button" aria-label="Fechar menu" onClick={toggle} className="fixed inset-0 z-40 bg-black/40" />}
      <aside
        aria-hidden={collapsed}
        style={{ width: collapsed ? 0 : width }}
        className="relative shrink-0 overflow-hidden bg-[var(--n-bg-sidebar)] transition-[width] duration-200 ease-out data-[drag=true]:transition-none max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:max-w-[85vw]"
      >
        <div style={{ width }} className="flex h-full max-w-[85vw] flex-col">
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
            <Link href="/inbox" className={row}>
              <Bell size={16} /> Inbox
              {unread > 0 && <span aria-label={`${unread} não lidas`} className="ml-auto rounded-full bg-[var(--n-accent)] px-1.5 text-[11px] font-medium text-white">{unread}</span>}
            </Link>
            <Link href="/tarefas" className={row}><ListChecks size={16} /> Minhas tarefas</Link>
            <Link href="/agenda" className={row}><CalendarDays size={16} /> Agenda</Link>
          </div>

          <div className="n-scroll flex-1 overflow-y-auto px-1.5 pb-2">
            {quick("Favoritos", favorites, "Use a estrela no topo de uma página.")}
            {quick("Recentes", recents.slice(0, 5))}
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
                  onMove={(id, parentId, position) => movePage.mutate({ id, parentId, position })}
                />}
          </div>

          <div className="border-t border-[var(--n-border)] p-1.5">
            {google?.status === "reconnect" && (
              <button type="button" className={`${row} text-orange-500`} onClick={() => void connectGoogle()}>Reconectar Google</button>
            )}
            <Trash triggerClass={row} />
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
