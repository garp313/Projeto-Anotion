"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { connectGoogle, memberName, notMigrated, useMembers } from "@/lib/collab";
import { Choice, Pop, fieldClass, toolbarBtn } from "@/components/database/ui";

type Role = "editor" | "viewer";
const ROLES: { value: Role; label: string }[] = [{ value: "editor", label: "Pode editar" }, { value: "viewer", label: "Só leitura" }];

type Access = { key: string; userId?: string; label: string; role: Role; note: string; table: "page_shares" | "workspace_members" | "invites"; inviteId?: string };

function Panel({ pageId, workspaceId }: { pageId: string; workspaceId: string }) {
  const qc = useQueryClient();
  const supabase = createClient();
  const { data: members = [] } = useMembers();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [note, setNote] = useState<string | null>(null);
  const [needsGmail, setNeedsGmail] = useState(false);
  const typed = email.trim();
  // Baixa uma vez e filtra aqui: a busca do Gmail não acha pedaços de nome como "th".
  const contacts = useQuery({
    queryKey: ["gmail-contacts"],
    enabled: typed.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<{ contacts: { name: string; email: string }[]; reason?: string }> => (await fetch("/api/gmail/contacts")).json(),
  });
  const nameOf = (id: string) => { const m = members.find((x) => x.id === id); return m ? memberName(m) : "Pessoa"; };

  const access = useQuery({
    queryKey: ["access", pageId],
    retry: false,
    queryFn: async () => {
      const [shares, team, invites] = await Promise.all([
        supabase.from("page_shares").select("user_id,role").eq("page_id", pageId),
        supabase.from("workspace_members").select("user_id,role").eq("workspace_id", workspaceId),
        supabase.from("invites").select("id,email,role,page_id").eq("workspace_id", workspaceId),
      ]);
      const failed = shares.error ?? team.error;
      if (failed) throw failed;
      return { shares: shares.data ?? [], team: team.data ?? [], invites: (invites.data ?? []).filter((i) => !i.page_id || i.page_id === pageId) };
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["access", pageId] }); qc.invalidateQueries({ queryKey: ["members"] }); qc.invalidateQueries({ queryKey: ["team-members"] }); };
  const accessFailed = (e: { code?: string; message?: string }) =>
    setNote(notMigrated(e) ? "Falta rodar a migration 0014 no Supabase." : e.code === "42501" && e.message ? e.message : "Não foi possível alterar o acesso.");

  const invite = useMutation({
    mutationFn: async () => {
      const target = email.trim().toLowerCase();
      const { data, error } = await supabase.rpc("invite_by_email", { p_workspace: workspaceId, p_page: null, p_email: target, p_role: role });
      if (error) throw error;
      const res = await fetch("/api/notify/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invite: target }) }).catch(() => null);
      const mail = res?.ok ? (await res.json()).result : null;
      return { added: data === "added", mail };
    },
    onSuccess: ({ added, mail }) => {
      setEmail(""); refresh();
      setNeedsGmail(mail === "not_connected");
      setNote(`${added ? "Acesso liberado." : "Convite criado: a pessoa entra ao fazer login com este e-mail."}${mail === "sent" ? " E-mail enviado." : ""}`);
    },
    onError: (e: any) => setNote(e?.code === "42501" ? e.message : "Não foi possível convidar."),
  });
  const changeRole = useMutation({
    mutationFn: async ({ a, role: next }: { a: Access; role: Role }) => {
      const q = a.table === "invites"
        ? supabase.from("invites").update({ role: next }).eq("id", a.inviteId!)
        : a.table === "page_shares"
          ? supabase.from("page_shares").update({ role: next }).eq("page_id", pageId).eq("user_id", a.userId!)
          : supabase.rpc("set_member_role", { p_user: a.userId!, p_role: next });
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: accessFailed,
  });
  const revoke = useMutation({
    mutationFn: async (a: Access) => {
      const q = a.table === "invites"
        ? supabase.from("invites").delete().eq("id", a.inviteId!)
        : a.table === "page_shares"
          ? supabase.from("page_shares").delete().eq("page_id", pageId).eq("user_id", a.userId!)
          : supabase.rpc("remove_member", { p_user: a.userId! });
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: accessFailed,
  });

  if (notMigrated(access.error as any)) return <p className="p-2 text-xs text-[var(--n-text-muted)]">Compartilhar fica disponível depois de rodar a migration 0003.</p>;

  const label = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;
  const people: Access[] = [
    ...(access.data?.shares ?? []).map((s) => ({ key: `s${s.user_id}`, userId: s.user_id, label: nameOf(s.user_id), role: s.role as Role, note: "Esta página", table: "page_shares" as const })),
    ...(access.data?.team ?? []).map((s) => ({ key: `w${s.user_id}`, userId: s.user_id, label: nameOf(s.user_id), role: s.role as Role, note: "Time", table: "workspace_members" as const })),
    ...(access.data?.invites ?? []).map((i) => ({ key: i.id, inviteId: i.id, label: i.email, role: i.role as Role, note: "Convite pendente", table: "invites" as const })),
  ];
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());
  const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const taken = new Set([...members.map((m) => m.email.toLowerCase()), ...(access.data?.invites ?? []).map((i) => i.email.toLowerCase())]);
  const suggestions = !typed ? [] : (contacts.data?.contacts ?? [])
    .filter((c) => !taken.has(c.email) && c.email !== typed.toLowerCase() && (fold(c.name).includes(fold(typed)) || c.email.includes(fold(typed))))
    .slice(0, 6);

  return (
    <div className="p-1">
      <form onSubmit={(e) => { e.preventDefault(); if (valid) invite.mutate(); }}>
        <p className="mb-1 text-xs text-[var(--n-text-muted)]">Quem entra no time vê todo o workspace.</p>
        <input autoFocus type="text" inputMode="email" autoComplete="off" aria-label="E-mail da pessoa" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Nome ou e-mail" className={fieldClass} />
        {suggestions.length > 0 && (
          <div role="listbox" aria-label="Sugestões do Gmail" className="mt-1 rounded border border-[var(--n-border)]">
            {suggestions.map((c) => (
              <button key={c.email} type="button" role="option" aria-selected={false} onClick={() => setEmail(c.email)}
                className="block w-full px-2 py-1 text-left hover:bg-[var(--n-hover)]">
                <span title={c.name || c.email} className="block truncate text-sm">{c.name || c.email}</span>
                {c.name && <span title={c.email} className="block truncate text-[11px] text-[var(--n-text-faint)]">{c.email}</span>}
              </button>
            ))}
          </div>
        )}
        {typed.length > 0 && contacts.data?.reason === "not_connected" && (
          <button type="button" onClick={() => connectGoogle()} className="mt-1 flex items-center gap-1 rounded px-1 py-0.5 text-xs text-[var(--n-accent)] hover:bg-[var(--n-hover)]">
            <Mail size={13} /> Conectar Gmail para sugerir e-mails
          </button>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Choice label="Papel" width={150} value={role} options={ROLES} onChange={setRole} />
          <button type="submit" disabled={!valid || invite.isPending}
            className="ml-auto flex items-center gap-1 rounded bg-[var(--n-accent)] px-2 py-1 text-xs font-medium text-white hover:brightness-95 disabled:opacity-50">
            <UserPlus size={13} /> Convidar
          </button>
        </div>
      </form>
      {note && <p role="status" className="mt-1 px-1 text-xs text-[var(--n-text-muted)]">{note}</p>}
      {needsGmail && (
        <button type="button" onClick={() => void connectGoogle()} className="mt-1 flex items-center gap-1 rounded px-1 py-0.5 text-xs text-[var(--n-accent)] hover:bg-[var(--n-hover)]">
          <Mail size={13} /> Conectar Gmail para enviar avisos por e-mail
        </button>
      )}
      <div className="mt-2 border-t border-[var(--n-border)] pt-1">
        {!people.length && <p className="px-1 py-1 text-xs text-[var(--n-text-faint)]">Ainda não há outras pessoas no time.</p>}
        {people.map((a) => (
          <div key={a.key} className="flex items-center gap-2 rounded px-1 py-1">
            <span className="min-w-0 flex-1">
              <span title={a.label} className="block truncate text-sm">{a.label}</span>
              <span className="block text-[11px] text-[var(--n-text-faint)]">{a.note}</span>
            </span>
            {(a.role as string) === "admin" ? <span className="px-1.5 text-xs text-[var(--n-text-muted)]">Administrador</span> : (
              <>
                <Choice label={`Papel de ${a.label}`} width={150} value={a.role} options={ROLES} onChange={(next) => changeRole.mutate({ a, role: next })} />
                <button type="button" aria-label={`Remover acesso de ${a.label}`} onClick={() => revoke.mutate(a)} className="rounded p-1 hover:bg-[var(--n-hover)]"><X size={13} /></button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ShareMenu({ pageId, workspaceId }: { pageId: string; workspaceId: string }) {
  return (
    <Pop width={340} align="end" triggerClass={`${toolbarBtn} shrink-0`} trigger={<>Convidar</>}>
      <Panel pageId={pageId} workspaceId={workspaceId} />
    </Pop>
  );
}
