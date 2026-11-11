"use client";
import { useMemo, useState } from "react";
import { Archive, ArrowLeft, Copy, CopyPlus, CornerUpRight, FileText, Link2, Pencil, Printer, Star, Trash2 } from "lucide-react";
import { usePageTree } from "@/lib/hooks/usePageTree";
import { createClient } from "@/lib/supabase/client";
import type { ColumnSchema } from "@/components/database/types";
import { useFavorites } from "@/lib/hooks/useFavorites";
import { CopyIdItem, fieldClass, menuItem } from "@/components/database/ui";

/** Itens do menu "…" de uma página, usados na barra lateral e no topo da página. */
export function PageMenu({ pageId, onClose, onRename }: { pageId: string; onClose: () => void; onRename: () => void }) {
  const { pages, archivePage, duplicatePage, movePage } = usePageTree();
  const { isFavorite, toggle } = useFavorites();
  const [moving, setMoving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [q, setQ] = useState("");
  const [usedBy, setUsedBy] = useState<string[] | null>(null);
  const [checking, setChecking] = useState(false);

  /** Bancos desta subárvore usados por campos de relação de fora dela: excluir quebraria esses campos. */
  const relationUsers = async () => {
    const list = pages.data ?? [];
    const inside = new Set([pageId]);
    for (let grew = true; grew;) {
      grew = false;
      for (const p of list) if (p.parent_id && inside.has(p.parent_id) && !inside.has(p.id)) { inside.add(p.id); grew = true; }
    }
    if (!list.some((p) => inside.has(p.id) && p.is_database)) return [];
    const { data } = await createClient().from("pages").select("id,title,database_schema").eq("is_database", true).eq("is_archived", false);
    const title = (id: string) => list.find((p) => p.id === id)?.title || "Sem título";
    return (data ?? []).filter((d) => !inside.has(d.id)).flatMap((d) => ((d.database_schema ?? []) as ColumnSchema[])
      .filter((c) => c.type === "relation" && c.relationDatabaseId && inside.has(c.relationDatabaseId) && list.some((p) => p.id === c.relationDatabaseId && p.is_database))
      .map((c) => `“${c.name}” em ${d.title || "Sem título"} (liga a ${title(c.relationDatabaseId!)})`));
  };
  const toTrash = async () => {
    setChecking(true);
    const users = await relationUsers().catch(() => []);
    setChecking(false);
    if (users.length) return setUsedBy(users);
    archivePage.mutate(pageId);
    onClose();
  };

  // Uma página não pode ir para dentro de si mesma nem de uma descendente.
  const destinations = useMemo(() => {
    const list = pages.data ?? [];
    const blocked = new Set([pageId]);
    for (let grew = true; grew;) {
      grew = false;
      for (const p of list) if (p.parent_id && blocked.has(p.parent_id) && !blocked.has(p.id)) { blocked.add(p.id); grew = true; }
    }
    const term = q.trim().toLowerCase();
    return list.filter((p) => !blocked.has(p.id) && (p.title || "Sem título").toLowerCase().includes(term)).slice(0, 30);
  }, [pages.data, pageId, q]);

  const moveTo = (parentId: string | null) => {
    movePage.mutate({ id: pageId, parentId, position: Date.now() });
    onClose();
  };
  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/workspace/${pageId}`);
    setCopied(true);
    setTimeout(onClose, 700);
  };

  if (usedBy) {
    return (
      <div role="alertdialog" aria-label="Banco em uso" className="p-2 text-sm">
        <p className="mb-1 font-medium">Este banco é usado por outros campos</p>
        <ul className="mb-2 list-disc pl-4 text-xs text-[var(--n-text-muted)]">{usedBy.slice(0, 6).map((u) => <li key={u}>{u}</li>)}</ul>
        <p className="mb-2 text-xs text-[var(--n-text-muted)]">Esses campos vão ficar sem banco até você escolher outro. Prefira trocar o banco deles antes.</p>
        <div className="flex gap-1">
          <button type="button" onClick={() => { archivePage.mutate(pageId); onClose(); }} className="rounded bg-red-500 px-2 py-1 text-xs font-medium text-white">Excluir mesmo assim</button>
          <button type="button" onClick={() => setUsedBy(null)} className="rounded px-2 py-1 text-xs hover:bg-[var(--n-hover)]">Cancelar</button>
        </div>
      </div>
    );
  }

  if (moving) {
    return (
      <div>
        <button type="button" className={menuItem} onClick={() => setMoving(false)}><ArrowLeft size={14} /> Mover para</button>
        <div className="p-1"><input autoFocus aria-label="Buscar destino" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar página…" className={fieldClass} /></div>
        <button type="button" className={menuItem} onClick={() => moveTo(null)}><FileText size={14} /> Raiz do workspace</button>
        {destinations.map((p) => (
          <button key={p.id} type="button" className={menuItem} onClick={() => moveTo(p.id)}>
            <span className="w-4 shrink-0 text-center">{p.icon ?? <FileText size={14} />}</span>
            <span className="truncate">{p.title || "Sem título"}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      <button type="button" className={menuItem} onClick={() => { void toggle(pageId); onClose(); }}>
        <Star size={14} className={isFavorite(pageId) ? "fill-yellow-400 text-yellow-400" : ""} />
        {isFavorite(pageId) ? "Remover dos favoritos" : "Favoritar"}
      </button>
      <button type="button" className={menuItem} onClick={onRename}><Pencil size={14} /> Renomear</button>
      <button type="button" className={menuItem} onClick={() => { duplicatePage.mutate(pageId); onClose(); }}><CopyPlus size={14} /> Duplicar</button>
      <button type="button" className={menuItem} onClick={copyLink}>
        {copied ? <Copy size={14} /> : <Link2 size={14} />} {copied ? "Link copiado" : "Copiar link"}
      </button>
      <CopyIdItem value={pageId} label="Copiar ID" />
      <button type="button" className={menuItem} onClick={() => setMoving(true)}><CornerUpRight size={14} /> Mover para</button>
      <button type="button" className={menuItem} onClick={() => { onClose(); setTimeout(() => window.print(), 100); }}><Printer size={14} /> Exportar PDF</button>
      <button type="button" className={menuItem} onClick={async () => { onClose(); await (await import("@/lib/export/zip")).exportZip(pageId); }}><Archive size={14} /> Exportar página (.zip)</button>
      <div className="my-1 border-t border-[var(--n-border)]" />
      <button type="button" disabled={checking} className={`${menuItem} text-red-500`} onClick={() => void toTrash()}>
        <Trash2 size={14} /> Mover para a lixeira
      </button>
    </div>
  );
}
