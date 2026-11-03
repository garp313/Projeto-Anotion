"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, ArrowRight, CornerDownLeft, X } from "lucide-react";
import { usePageTree, type PageRow } from "@/lib/hooks/usePageTree";

export function SearchModal() {
  const router = useRouter();
  const { pages } = usePageTree();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Escutar Ctrl+K / Cmd+K e evento customizado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };

    const handleCustomOpen = () => setOpen(true);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("open-search", handleCustomOpen);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("open-search", handleCustomOpen);
    };
  }, [open]);

  // Foco automático no input ao abrir
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Filtrar páginas
  const filteredPages = useMemo(() => {
    const list = pages.data ?? [];
    if (!query.trim()) return list.slice(0, 15);
    const q = query.toLowerCase();
    return list
      .filter((p) => (p.title || "Sem título").toLowerCase().includes(q))
      .slice(0, 20);
  }, [pages.data, query]);

  // Resetar seleção se a lista mudar
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const selectPage = (p: PageRow) => {
    setOpen(false);
    router.push(`/workspace/${p.id}`);
  };

  const handleKeyNavigation = (e: React.KeyboardEvent) => {
    if (filteredPages.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredPages.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredPages.length) % filteredPages.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = filteredPages[selectedIndex];
      if (current) selectPage(current);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[14vh] backdrop-blur-xs transition-opacity"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-[620px] overflow-hidden rounded-xl border border-[var(--n-border)] bg-[var(--n-bg)] shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input Bar */}
        <div className="flex h-14 items-center gap-3 border-b border-[var(--n-border)] px-4">
          <Search size={18} className="shrink-0 text-[var(--n-text-faint)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyNavigation}
            placeholder="Buscar páginas no workspace..."
            className="flex-1 bg-transparent text-base text-[var(--n-text)] placeholder:text-[var(--n-text-faint)] outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="grid h-5 w-5 place-items-center rounded text-[var(--n-text-faint)] hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]"
            >
              <X size={14} />
            </button>
          )}
          <kbd className="hidden rounded bg-[var(--n-hover)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--n-text-faint)] sm:inline-block">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="n-scroll max-h-[380px] overflow-y-auto p-2">
          {filteredPages.length === 0 ? (
            <div className="py-12 text-center text-sm text-[var(--n-text-faint)]">
              Nenhuma página encontrada para &quot;{query}&quot;
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--n-text-faint)]">
                {query ? "Resultados" : "Recentes / Todas as Páginas"}
              </div>
              {filteredPages.map((page, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={page.id}
                    onClick={() => selectPage(page)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? "bg-[var(--n-active)] text-[var(--n-text)]"
                        : "text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]"
                    }`}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center text-lg">
                      {page.icon ?? <FileText size={16} className="text-[var(--n-text-faint)]" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {page.title || "Sem título"}
                    </span>
                    {isSelected && (
                      <span className="flex items-center gap-1 text-xs text-[var(--n-text-faint)]">
                        Abrir <CornerDownLeft size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-[var(--n-border)] bg-[var(--n-bg-sidebar)] px-4 py-2 text-[11px] text-[var(--n-text-faint)]">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded bg-[var(--n-hover)] px-1 py-0.5 font-mono">↑</kbd>{" "}
              <kbd className="rounded bg-[var(--n-hover)] px-1 py-0.5 font-mono">↓</kbd> navegar
            </span>
            <span>
              <kbd className="rounded bg-[var(--n-hover)] px-1 py-0.5 font-mono">↵</kbd> selecionar
            </span>
            <span>
              <kbd className="rounded bg-[var(--n-hover)] px-1 py-0.5 font-mono">esc</kbd> fechar
            </span>
          </div>
          <span>{filteredPages.length} página(s)</span>
        </div>
      </div>
    </div>
  );
}
