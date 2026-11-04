"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CornerDownLeft, FileText, Search, X } from "lucide-react";
import { usePageTree } from "@/lib/hooks/usePageTree";
import { fold, loadEventIndex, loadPageIndex, snippet, type EventHit, type PageHit } from "./searchIndex";

type Result =
  | { kind: "page"; hit: PageHit; detail?: string }
  | { kind: "event"; hit: EventHit; detail: string };

const MAX_RESULTS = 30;

export function SearchModal() {
  const router = useRouter();
  const { pages } = usePageTree();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // O texto é limpo ao abrir, no mesmo update: nada digitado depois disso se perde.
  useEffect(() => {
    const show = () => { setQuery(""); setSelectedIndex(0); setOpen(true); };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((was) => { if (!was) { setQuery(""); setSelectedIndex(0); } return !was; });
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-search", show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-search", show);
    };
  }, []);

  // Foco antes da pintura: a primeira tecla após o atalho já cai no campo.
  useLayoutEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const index = useQuery({ queryKey: ["search-index"], queryFn: loadPageIndex, enabled: open, staleTime: 30_000 });
  const events = useQuery({ queryKey: ["search-events"], queryFn: loadEventIndex, enabled: open, staleTime: 60_000, retry: false });

  const results = useMemo<Result[]>(() => {
    const q = fold(query.trim());
    if (!q) {
      return (pages.data ?? []).slice(0, 15).map((p) => ({
        kind: "page", hit: { kind: "page", id: p.id, title: p.title, icon: p.icon, fields: [], links: [] },
      }));
    }
    const titled: Result[] = [], inside: Result[] = [];
    for (const hit of index.data ?? []) {
      if (fold(hit.title).includes(q)) { titled.push({ kind: "page", hit, detail: hit.parentTitle }); continue; }
      const field = hit.fields.find((f) => fold(f.text).includes(q));
      if (field) inside.push({ kind: "page", hit, detail: `${field.label}: ${snippet(field.text, q)}` });
    }
    const agenda: Result[] = (events.data ?? [])
      .filter((e) => [e.title, e.location, e.description].some((t) => t && fold(t).includes(q)))
      .map((hit) => ({ kind: "event", hit, detail: hit.when }));
    return [...titled, ...agenda, ...inside].slice(0, MAX_RESULTS);
  }, [query, index.data, events.data, pages.data]);

  useEffect(() => setSelectedIndex(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const choose = (r: Result) => {
    setOpen(false);
    router.push(r.kind === "page" ? `/workspace/${r.hit.id}` : `/agenda?date=${r.hit.day}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => (i + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => (i - 1 + results.length) % results.length); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[selectedIndex]) choose(results[selectedIndex]); }
  };

  if (!open) return null;
  const searching = Boolean(query.trim()) && (index.isLoading || events.isLoading);

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 p-4 pt-[14vh]" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Buscar"
        className="w-full max-w-[620px] overflow-hidden rounded-xl border border-[var(--n-border)] bg-[var(--n-bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex h-14 items-center gap-3 border-b border-[var(--n-border)] px-4">
          <Search size={18} className="shrink-0 text-[var(--n-text-faint)]" />
          <input
            ref={inputRef} type="text" value={query} aria-label="Buscar" onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Buscar páginas, propriedades e eventos…"
            className="min-w-0 flex-1 bg-transparent text-base text-[var(--n-text)] outline-none placeholder:text-[var(--n-text-faint)]"
          />
          {query && (
            <button type="button" aria-label="Limpar busca" onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              className="grid h-5 w-5 place-items-center rounded text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]">
              <X size={14} />
            </button>
          )}
          <kbd className="hidden rounded bg-[var(--n-hover)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--n-text-faint)] sm:inline-block">ESC</kbd>
        </div>

        <div ref={listRef} role="listbox" aria-label="Resultados" className="n-scroll max-h-[380px] overflow-y-auto p-2">
          {!results.length ? (
            <p className="py-12 text-center text-sm text-[var(--n-text-faint)]">
              {searching ? "Buscando…" : <>Nada encontrado para &quot;{query}&quot;</>}
            </p>
          ) : results.map((r, i) => {
            const selected = i === selectedIndex;
            return (
              <button key={`${r.kind}${r.hit.id}`} type="button" role="option" aria-selected={selected}
                onClick={() => choose(r)} onMouseEnter={() => setSelectedIndex(i)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm ${selected ? "bg-[var(--n-active)] text-[var(--n-text)]" : "text-[var(--n-text-muted)]"}`}>
                <span className="grid h-6 w-6 shrink-0 place-items-center text-lg">
                  {r.kind === "event"
                    ? <CalendarDays size={16} className="text-[var(--n-text-faint)]" />
                    : r.hit.icon ?? <FileText size={16} className="text-[var(--n-text-faint)]" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.hit.title || "Sem título"}</span>
                  {r.detail && <span className="block truncate text-xs text-[var(--n-text-faint)]">{r.detail}</span>}
                </span>
                {selected && <span className="flex shrink-0 items-center gap-1 text-xs text-[var(--n-text-faint)]">Abrir <CornerDownLeft size={12} /></span>}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--n-border)] bg-[var(--n-bg-sidebar)] px-4 py-2 text-[11px] text-[var(--n-text-faint)]">
          <span>↑↓ navegar · ↵ abrir · esc fechar</span>
          <span>{results.length} resultado(s)</span>
        </div>
      </div>
    </div>
  );
}
