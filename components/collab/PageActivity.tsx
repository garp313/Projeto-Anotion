"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { memberName, notMigrated, scheduleEmails, useMembers, type Member } from "@/lib/collab";

type Comment = { id: string; author_id: string; body: string; created_at: string };
type Activity = { id: number; actor_id: string | null; prop: string; from_text: string; to_text: string; created_at: string };

const when = (s: string) => new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const avatar = (name: string) => (
  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--n-active)] text-[11px] font-medium uppercase">{name[0] ?? "?"}</span>
);

/** Campo de comentário: "@" abre a lista de pessoas e guarda quem foi mencionado. */
function CommentBox({ members, onSend, busy }: { members: Member[]; onSend: (body: string, mentions: string[]) => void; busy: boolean }) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Member[]>([]);
  const term = /(?:^|\s)@([^\s@]*)$/.exec(text)?.[1];
  const list = term === undefined ? [] : members.filter((m) => memberName(m).toLowerCase().includes(term.toLowerCase())).slice(0, 6);
  const choose = (m: Member) => {
    setText((t) => t.replace(/@([^\s@]*)$/, `@${memberName(m)} `));
    setPicked((p) => [...p, m]);
  };
  const send = () => {
    const body = text.trim();
    if (!body || busy) return;
    onSend(body, [...new Set(picked.filter((m) => body.includes(`@${memberName(m)}`)).map((m) => m.id))]);
    setText(""); setPicked([]);
  };
  return (
    <div className="relative">
      {list.length > 0 && (
        <div role="listbox" aria-label="Mencionar pessoa" className="absolute bottom-full z-20 mb-1 w-64 rounded-lg border border-[var(--n-border)] bg-[var(--n-bg)] p-1 shadow-xl">
          {list.map((m) => (
            <button key={m.id} type="button" role="option" aria-selected={false} onClick={() => choose(m)}
              className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-[var(--n-hover)]">{memberName(m)}</button>
          ))}
        </div>
      )}
      <textarea rows={2} value={text} aria-label="Novo comentário" placeholder="Comente ou use @ para marcar alguém…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (list[0]) choose(list[0]); else send(); } }}
        className="w-full resize-none rounded-md border border-[var(--n-border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--n-accent)]" />
      <div className="mt-1 flex justify-end">
        <button type="button" disabled={!text.trim() || busy} onClick={send}
          className="rounded bg-[var(--n-accent)] px-2.5 py-1 text-xs font-medium text-white hover:brightness-95 disabled:opacity-50">Comentar</button>
      </div>
    </div>
  );
}

/** Só aparece em tarefas criadas de um e-mail. O envio fica registrado nos comentários. */
function EmailReply({ pageId }: { pageId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [forwardTo, setForwardTo] = useState("");
  const [forwarding, setForwarding] = useState(false);
  const link = useQuery({
    queryKey: ["email-link", pageId],
    retry: false,
    queryFn: async () => {
      const { data } = await createClient().from("external_links").select("id").eq("page_id", pageId).eq("provider", "gmail").eq("kind", "message").maybeSingle();
      return data;
    },
  });
  const send = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/gmail/reply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, text, forwardTo: forwarding ? forwardTo : undefined }),
      });
      if (!res.ok) throw new Error("failed");
    },
    onSuccess: () => { setText(""); setForwardTo(""); qc.invalidateQueries({ queryKey: ["comments", pageId] }); },
  });
  if (!link.data) return null;
  const field = "w-full rounded-md border border-[var(--n-border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--n-accent)]";
  return (
    <div className="mt-3 rounded-md border border-[var(--n-border)] p-2">
      <div className="mb-1 flex items-center gap-2 text-xs">
        <b className="font-medium">E-mail de origem</b>
        <label className="ml-auto flex items-center gap-1 text-[var(--n-text-muted)]">
          <input type="checkbox" checked={forwarding} onChange={(e) => setForwarding(e.target.checked)} className="accent-[var(--n-accent)]" /> Encaminhar
        </label>
      </div>
      {forwarding && <input type="email" aria-label="Encaminhar para" value={forwardTo} onChange={(e) => setForwardTo(e.target.value)} placeholder="Encaminhar para" className={`${field} mb-1`} />}
      <textarea rows={2} aria-label="Resposta por e-mail" value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva a mensagem…" className={`${field} resize-none`} />
      <div className="mt-1 flex items-center justify-end gap-2">
        {send.isError && <span role="alert" className="text-xs text-red-500">Não foi possível enviar.</span>}
        <button type="button" disabled={!text.trim() || send.isPending || (forwarding && !forwardTo.trim())} onClick={() => send.mutate()}
          className="rounded bg-[var(--n-accent)] px-2.5 py-1 text-xs font-medium text-white hover:brightness-95 disabled:opacity-50">{forwarding ? "Encaminhar" : "Responder"}</button>
      </div>
    </div>
  );
}

/** Comentários e histórico no fim da página: quem disse, quem mudou o quê e quando. */
export function PageActivity({ pageId }: { pageId: string }) {
  const qc = useQueryClient();
  const supabase = createClient();
  const [tab, setTab] = useState<"comments" | "activity">("comments");
  const { data: members = [] } = useMembers();
  const nameOf = useMemo(() => {
    const map = new Map(members.map((m) => [m.id, memberName(m)]));
    return (id: string | null) => (id && map.get(id)) || "Alguém";
  }, [members]);

  const comments = useQuery({
    queryKey: ["comments", pageId],
    queryFn: async () => {
      const { data, error } = await supabase.from("comments").select("id,author_id,body,created_at").eq("page_id", pageId).order("created_at");
      if (error) throw error;
      return data as Comment[];
    },
    retry: false,
  });
  const activity = useQuery({
    queryKey: ["activity", pageId],
    enabled: tab === "activity",
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("page_activity").select("id,actor_id,prop,from_text,to_text,created_at")
        .eq("page_id", pageId).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data as Activity[];
    },
  });
  const add = useMutation({
    mutationFn: async ({ body, mentions }: { body: string; mentions: string[] }) => {
      const { error } = await supabase.from("comments").insert({ page_id: pageId, body, mentions });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["comments", pageId] }); scheduleEmails(); },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", pageId] }),
  });

  if (notMigrated(comments.error as any)) {
    return <p className="mt-8 border-t border-[var(--n-border)] pt-3 text-xs text-[var(--n-text-faint)]">Comentários e histórico ficam disponíveis depois de rodar a migration 0003.</p>;
  }
  const tabClass = (on: boolean) => `rounded px-2 py-0.5 text-sm ${on ? "bg-[var(--n-active)] font-medium" : "text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]"}`;
  return (
    <section aria-label="Comentários e atividade" className="mt-8 border-t border-[var(--n-border)] pt-3 print:hidden">
      <div className="mb-3 flex gap-1">
        <button type="button" aria-pressed={tab === "comments"} className={tabClass(tab === "comments")} onClick={() => setTab("comments")}>
          Comentários{comments.data?.length ? ` (${comments.data.length})` : ""}
        </button>
        <button type="button" aria-pressed={tab === "activity"} className={tabClass(tab === "activity")} onClick={() => setTab("activity")}>Atividade</button>
      </div>

      {tab === "comments" ? (
        <>
          {comments.data?.map((c) => (
            <div key={c.id} className="group mb-3 flex gap-2">
              {avatar(nameOf(c.author_id))}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--n-text-muted)]"><b className="font-medium text-[var(--n-text)]">{nameOf(c.author_id)}</b> · {when(c.created_at)}</p>
                <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
              </div>
              <button type="button" aria-label="Apagar comentário" onClick={() => remove.mutate(c.id)}
                className="h-fit rounded p-1 text-[var(--n-text-faint)] opacity-0 hover:bg-[var(--n-hover)] focus:opacity-100 group-hover:opacity-100"><Trash2 size={13} /></button>
            </div>
          ))}
          <CommentBox members={members} busy={add.isPending} onSend={(body, mentions) => add.mutate({ body, mentions })} />
          {add.isError && <p role="alert" className="mt-1 text-xs text-red-500">Não foi possível enviar o comentário.</p>}
          <EmailReply pageId={pageId} />
        </>
      ) : !activity.data?.length ? (
        <p className="text-sm text-[var(--n-text-faint)]">{activity.isLoading ? "Carregando…" : "Nenhuma alteração registrada ainda."}</p>
      ) : (
        <ul className="space-y-2">
          {activity.data.map((a) => (
            <li key={a.id} className="flex gap-2 text-sm">
              {avatar(nameOf(a.actor_id))}
              <span className="min-w-0">
                <b className="font-medium">{nameOf(a.actor_id)}</b> alterou <b className="font-medium">{a.prop}</b>
                {a.from_text && <> de <span className="text-[var(--n-text-muted)]">{a.from_text}</span></>}
                {a.to_text ? <> para <span className="text-[var(--n-text-muted)]">{a.to_text}</span></> : " para vazio"}
                <span className="block text-xs text-[var(--n-text-faint)]">{when(a.created_at)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
