"use client";
import { useMemo, useState } from "react";
import { ArrowLeft, Copy, CopyPlus, CornerUpRight, FileText, Link2, Pencil, Printer, Star, Trash2 } from "lucide-react";
import { usePageTree } from "@/lib/hooks/usePageTree";
import { useFavorites } from "@/lib/hooks/useFavorites";
import { fieldClass, menuItem } from "@/components/database/ui";

/** Itens do menu "…" de uma página, usados na barra lateral e no topo da página. */
export function PageMenu({ pageId, onClose, onRename }: { pageId: string; onClose: () => void; onRename: () => void }) {
  const { pages, archivePage, duplicatePage, movePage } = usePageTree();
  const { isFavorite, toggle } = useFavorites();
  const [moving, setMoving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [q, setQ] = useState("");

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
      <button type="button" className={menuItem} onClick={() => setMoving(true)}><CornerUpRight size={14} /> Mover para</button>
      <button type="button" className={menuItem} onClick={() => { onClose(); setTimeout(() => window.print(), 100); }}><Printer size={14} /> Exportar PDF</button>
      <div className="my-1 border-t border-[var(--n-border)]" />
      <button type="button" className={`${menuItem} text-red-500`} onClick={() => { archivePage.mutate(pageId); onClose(); }}>
        <Trash2 size={14} /> Mover para a lixeira
      </button>
    </div>
  );
}
