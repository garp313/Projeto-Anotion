"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CornerDownRight } from "lucide-react";
import { loadPageIndex } from "@/components/search/searchIndex";

/** Páginas que mencionam esta. */
export function Backlinks({ pageId }: { pageId: string }) {
  const { data } = useQuery({ queryKey: ["search-index"], queryFn: loadPageIndex, staleTime: 30_000 });
  const links = (data ?? []).filter((p) => p.id !== pageId && p.links.includes(pageId));
  if (!links.length) return null;
  return (
    <section aria-label="Páginas que citam esta" className="mt-10 border-t border-[var(--n-border)] pt-3">
      <p className="mb-1 flex items-center gap-1 text-xs text-[var(--n-text-faint)]"><CornerDownRight size={12} /> {links.length} {links.length === 1 ? "página cita" : "páginas citam"} esta</p>
      {links.map((p) => (
        <Link key={p.id} href={`/workspace/${p.id}`} className="block truncate rounded px-1 py-0.5 text-sm text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]">
          {p.icon} {p.title || "Sem título"}
        </Link>
      ))}
    </section>
  );
}
