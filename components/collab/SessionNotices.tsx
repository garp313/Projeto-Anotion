"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const GOOGLE_MESSAGES: Record<string, string> = {
  connected: "Google conectado à sua conta.",
  denied: "A autorização do Google foi cancelada.",
  failed: "Não foi possível conectar o Google. Tente de novo.",
  missing_keys: "Faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET na configuração do app.",
};

/** Avisos vindos pela URL: link de e-mail aberto na conta errada e resultado da conexão com o Google. */
export function SessionNotices() {
  const [wrong, setWrong] = useState<{ wanted: string; current: string } | null>(null);
  const [google, setGoogle] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const wanted = url.searchParams.get("para")?.toLowerCase();
    const status = url.searchParams.get("google");
    if (status && GOOGLE_MESSAGES[status]) setGoogle(GOOGLE_MESSAGES[status]);
    url.searchParams.delete("google");
    if (status) window.history.replaceState(null, "", url);
    if (!wanted) return;
    createClient().auth.getSession().then(({ data }) => {
      const current = data.session?.user.email?.toLowerCase();
      if (current && current !== wanted) setWrong({ wanted, current });
    });
  }, []);

  async function switchAccount() {
    const next = window.location.pathname;
    await createClient().auth.signOut();
    window.location.href = `/login?next=${encodeURIComponent(next)}`;
  }

  if (!wrong && !google) return null;
  return (
    <div className="fixed inset-x-0 top-2 z-[90] mx-auto flex w-fit max-w-[calc(100vw-32px)] flex-col gap-2">
      {wrong && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-orange-400 bg-[var(--n-bg)] px-3 py-2 text-sm shadow-xl">
          <span>Este link é para <b>{wrong.wanted}</b>, mas você está como <b>{wrong.current}</b>.</span>
          <button type="button" onClick={() => void switchAccount()} className="rounded bg-[var(--n-accent)] px-2 py-1 text-xs font-medium text-white hover:brightness-95">Trocar de conta</button>
          <button type="button" aria-label="Fechar aviso" onClick={() => setWrong(null)} className="rounded p-1 hover:bg-[var(--n-hover)]"><X size={13} /></button>
        </div>
      )}
      {google && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-[var(--n-border)] bg-[var(--n-bg)] px-3 py-2 text-sm shadow-xl">
          <span>{google}</span>
          <button type="button" aria-label="Fechar aviso" onClick={() => setGoogle(null)} className="rounded p-1 hover:bg-[var(--n-hover)]"><X size={13} /></button>
        </div>
      )}
    </div>
  );
}
