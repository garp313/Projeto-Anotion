"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/** Favoritos ficam no perfil do usuário: são pessoais e acompanham a pessoa em qualquer aparelho. */
export function useFavorites() {
  const qc = useQueryClient();
  const { data: favorites = [] } = useQuery({
    queryKey: ["favorites"],
    queryFn: async (): Promise<string[]> => {
      const { data } = await createClient().auth.getSession();
      return data.session?.user.user_metadata?.favorites ?? [];
    },
    staleTime: Infinity,
  });

  const toggle = async (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
    qc.setQueryData(["favorites"], next);
    const { error } = await createClient().auth.updateUser({ data: { favorites: next } });
    if (error) qc.setQueryData(["favorites"], favorites);
  };

  return { favorites, isFavorite: (id: string) => favorites.includes(id), toggle };
}

const RECENTS_KEY = "recent-pages";
const RECENTS_EVENT = "recent-pages-changed";
const MAX_RECENTS = 5;

function readRecents(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]"); } catch { return []; }
}

export function pushRecent(id: string) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify([id, ...readRecents().filter((r) => r !== id)].slice(0, MAX_RECENTS + 1)));
    window.dispatchEvent(new Event(RECENTS_EVENT));
  } catch { /* armazenamento indisponível */ }
}

export function useRecents() {
  const [recents, setRecents] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setRecents(readRecents());
    sync();
    window.addEventListener(RECENTS_EVENT, sync);
    return () => window.removeEventListener(RECENTS_EVENT, sync);
  }, []);
  return recents;
}
