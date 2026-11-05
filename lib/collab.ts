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

/** Papel no time. O dono do workspace não aparece como membro: vale como editor. */
export function useMyRole() {
  return useQuery({
    queryKey: ["my-role"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<"editor" | "viewer"> => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getSession();
      const { data } = await supabase.from("workspace_members").select("role").eq("user_id", auth.session?.user.id ?? "").maybeSingle();
      return data?.role === "viewer" ? "viewer" : "editor";
    },
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

/** Autoriza o Google para a conta já logada, sem trocar quem está no app. Volta para a mesma tela. */
export function connectGoogle() {
  window.location.href = `/api/google/connect?next=${encodeURIComponent(window.location.pathname)}`;
}
