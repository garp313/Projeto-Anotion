"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { connectGoogle, memberName, notMigrated, useMembers } from "@/lib/collab";
import { Choice, Pop, fieldClass, toolbarBtn } from "@/components/database/ui";

type Role = "editor" | "viewer";
type Scope = "page" | "workspace";
const ROLES: { value: Role; label: string }[] = [{ value: "editor", label: "Pode editar" }, { value: "viewer", label: "Só leitura" }];
const SCOPES: { value: Scope; label: string }[] = [{ value: "page", label: "Só esta página" }, { value: "workspace", label: "Todo o workspace" }];

type Access = { key: string; userId?: string; label: string; role: Role; note: string; table: "page_shares" | "workspace_members" | "invites"; inviteId?: string };

function Panel({ pageId, workspaceId }: { pageId: string; workspaceId: string }) {
  const qc = useQueryClient();
  const supabase = createClient();
  const { data: members = [] } = useMembers();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [scope, setScope] = useState<Scope>("page");
  const [note, setNote] = useState<string | null>(null);
  const [needsGmail, setNeedsGmail] = useState(false);
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
  const refresh = () => { qc.invalidateQueries({ queryKey: ["access", pageId] }); qc.invalidateQueries({ queryKey: ["members"] }); };

  const invite = useMutation({
    mutationFn: async () => {
      const target = email.trim().toLowerCase();
      const { data, error } = await supabase.rpc("invite_by_email", { p_workspace: workspaceId, p_page: scope === "page" ? pageId : null, p_email: target, p_role: role });
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
  const revoke = useMutation({
    mutationFn: async (a: Access) => {
      const q = a.table === "invites"
        ? supabase.from("invites").delete().eq("id", a.inviteId!)
        : a.table === "page_shares"
          ? supabase.from("page_shares").delete().eq("page_id", pageId).eq("user_id", a.userId!)
          : supabase.from("workspace_members").delete().eq("workspace_id", workspaceId).eq("user_id", a.userId!);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  if (notMigrated(access.error as any)) return <p className="p-2 text-xs text-[var(--n-text-muted)]">Compartilhar fica disponível depois de rodar a migration 0003.</p>;

  const label = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;
  const people: Access[] = [
    ...(access.data?.shares ?? []).map((s) => ({ key: `s${s.user_id}`, userId: s.user_id, label: nameOf(s.user_id), role: s.role as Role, note: "Esta página", table: "page_shares" as const })),
    ...(access.data?.team ?? []).map((s) => ({ key: `w${s.user_id}`, userId: s.user_id, label: nameOf(s.user_id), role: s.role as Role, note: "Workspace", table: "workspace_members" as const })),
    ...(access.data?.invites ?? []).map((i) => ({ key: i.id, inviteId: i.id, label: i.email, role: i.role as Role, note: "Convite pendente", table: "invites" as const })),
  ];
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <div className="p-1">
      <form onSubmit={(e) => { e.preventDefault(); if (valid) invite.mutate(); }}>
        <input autoFocus type="email" aria-label="E-mail da pessoa" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail da pessoa" className={fieldClass} />
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Choice label="Alcance" value={scope} options={SCOPES} onChange={setScope} />
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
        {!people.length && <p className="px-1 py-1 text-xs text-[var(--n-text-faint)]">Só você tem acesso.</p>}
        {people.map((a) => (
          <div key={a.key} className="flex items-center gap-2 rounded px-1 py-1">
            <span className="min-w-0 flex-1">
              <span title={a.label} className="block truncate text-sm">{a.label}</span>
              <span className="block text-[11px] text-[var(--n-text-faint)]">{a.note} · {label(a.role)}</span>
            </span>
            <button type="button" aria-label={`Remover acesso de ${a.label}`} onClick={() => revoke.mutate(a)} className="rounded p-1 hover:bg-[var(--n-hover)]"><X size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ShareMenu({ pageId, workspaceId }: { pageId: string; workspaceId: string }) {
  return (
    <Pop width={340} align="end" triggerClass={`${toolbarBtn} shrink-0`} trigger={<>Compartilhar</>}>
      <Panel pageId={pageId} workspaceId={workspaceId} />
    </Pop>
  );
}
