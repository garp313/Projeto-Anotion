"use client";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Member = { id: string; name: string; email: string };
export type Notification = {
  id: string; kind: "assigned" | "mention" | "comment" | "status"; page_id: string | null;
  body: string; read_at: string | null; created_at: string;
};

/** Sem a migration 0003 as tabelas não existem: as telas avisam em vez de quebrar. */
export const notMigrated = (e?: { code?: string } | null) => ["PGRST205", "PGRST202", "42P01", "42883"].includes(e?.code ?? "");

/** Pessoas que podem ser atribuídas ou mencionadas. */
export function useMembers() {
  return useQuery({
    queryKey: ["members"],
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await createClient().rpc("collaborators");
      return error ? [] : (data as Member[]);
    },
    staleTime: 5 * 60_000,
  });
}

export const memberName = (m: Member) => m.name || m.email;

export function useUnreadCount() {
  return useQuery({
    queryKey: ["unread"],
    queryFn: async () => {
      const { count, error } = await createClient().from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
      return error ? 0 : count ?? 0;
    },
    refetchInterval: 60_000,
  });
}

/** Estado da conexão Google guardada no servidor. Sem a migration 0004, fica vazio. */
export function useGoogleStatus() {
  return useQuery({
    queryKey: ["google-status"],
    queryFn: async () => {
      const { data, error } = await createClient().rpc("google_status");
      return error ? null : ((data as { status: string; daily_digest: boolean }[])[0] ?? null);
    },
    staleTime: 5 * 60_000,
  });
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** O envio sai do Gmail de quem agiu: junta as ações próximas numa só chamada. */
export function scheduleEmails(delay = 2500) {
  clearTimeout(timer);
  timer = setTimeout(() => { void fetch("/api/notify/email", { method: "POST" }).catch(() => { /* fica na fila por 1 hora */ }); }, delay);
}

export async function connectGoogle() {
  // O callback lê este cookie para saber que deve guardar os tokens e voltar para a Agenda.
  document.cookie = "after_auth=/agenda; path=/; max-age=600; samesite=lax";
  await createClient().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly",
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });
}
