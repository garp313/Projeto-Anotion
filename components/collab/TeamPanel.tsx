"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { notMigrated } from "@/lib/collab";
import { Choice } from "@/components/database/ui";

type Role = "admin" | "editor" | "viewer";
type TeamMember = { id: string; name: string | null; email: string; role: Role | "owner" };

const LABEL: Record<TeamMember["role"], string> = { owner: "Dono", admin: "Administrador", editor: "Pode editar", viewer: "Só leitura" };
const ALL: { value: Role; label: string }[] = (["admin", "editor", "viewer"] as Role[]).map((value) => ({ value, label: LABEL[value] }));
const RANK = { owner: 0, admin: 1, editor: 2, viewer: 3 };

export function TeamPanel() {
  const qc = useQueryClient();
  const [me, setMe] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { createClient().auth.getSession().then(({ data }) => setMe(data.session?.user.id ?? null)); }, []);

  const team = useQuery({
    queryKey: ["team-members"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await createClient().rpc("team_members");
      if (error) throw error;
      return data as TeamMember[];
    },
  });
  const setRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Role }) => {
      const { error } = await createClient().rpc("set_member_role", { p_user: id, p_role: role });
      if (error) throw error;
    },
    onMutate: () => setNote(null),
    onSuccess: () => { setNote("Permissão atualizada."); qc.invalidateQueries({ queryKey: ["team-members"] }); qc.invalidateQueries({ queryKey: ["my-role"] }); },
    onError: (e: { code?: string; message?: string }) => setNote(e.code === "42501" && e.message ? e.message : "Não foi possível mudar a permissão. Tente de novo."),
  });

  const people = [...(team.data ?? [])].sort((a, b) => RANK[a.role] - RANK[b.role] || (a.name || a.email).localeCompare(b.name || b.email));
  const myRole = people.find((p) => p.id === me)?.role;
  const canChange = (p: TeamMember) => p.role !== "owner" && (myRole === "owner" || (myRole === "admin" && p.role !== "admin"));
  const options = myRole === "owner" ? ALL : ALL.filter((o) => o.value !== "admin");

  return (
    <div className="mx-auto w-full max-w-[760px] p-6 pt-12 sm:px-10">
      <h1 className="text-2xl font-bold">Time e permissões</h1>
      <p className="mt-1 text-sm text-[var(--n-text-muted)]">Administradores editam tudo, convidam pessoas e mudam papéis. Só o dono define quem é administrador.</p>
      {notMigrated(team.error as { code?: string } | null) ? <p role="alert" className="mt-6 text-sm text-red-500">Falta rodar a migration 0014 no Supabase.</p>
        : team.error ? <p role="alert" className="mt-6 text-sm text-red-500">Não foi possível carregar o time.</p>
        : team.isLoading ? <p className="mt-6 text-sm text-[var(--n-text-faint)]">Carregando…</p>
        : (
          <ul aria-label="Pessoas do time" className="mt-6 divide-y divide-[var(--n-border)] border-y border-[var(--n-border)]">
            {people.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--n-active)] text-xs font-semibold">{(p.name || p.email)[0]?.toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name || p.email}{p.id === me ? " (você)" : ""}</span>
                  <span className="block truncate text-xs text-[var(--n-text-faint)]">{p.email}</span>
                </span>
                {canChange(p)
                  ? <Choice label={`Papel de ${p.name || p.email}`} width={170} value={p.role as Role} options={options} onChange={(role) => setRole.mutate({ id: p.id, role })} />
                  : <span className="px-1.5 text-xs text-[var(--n-text-muted)]">{LABEL[p.role]}</span>}
              </li>
            ))}
          </ul>
        )}
      {note && <p role="status" className="mt-3 text-xs text-[var(--n-text-muted)]">{note}</p>}
    </div>
  );
}
