"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Archive, ArchiveRestore, AtSign, Bell, CircleDot, Mail, MailOpen, MessageSquare, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { connectGoogle, notMigrated, type Notification } from "@/lib/collab";
import { loadTasks, type Task } from "@/lib/tasks";
import { formatDateValue } from "@/components/database/values";
import { EmailsPanel } from "./EmailsPanel";
import { isAssignedTo } from "@/lib/assignee";

/** A lista completa fica em Minhas tarefas: aqui os prazos não podem esconder as notificações. */
const ALERTS_SHOWN = 5;
const ICON = { assigned: UserPlus, mention: AtSign, comment: MessageSquare, status: CircleDot };
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Prazo e lembrete são calculados na hora: aparecem só aqui, sem e-mail. */
function dueAlert(t: Task): { label: string; tone: string } | null {
  if (!t.due) return null;
  const due = (t.due.end ?? t.due.start).slice(0, 10);
  const now = new Date();
  const today = iso(now);
  if (due < today) return { label: "Atrasada", tone: "text-red-500" };
  if (due === today) return { label: "Vence hoje", tone: "text-orange-500" };
  const within = (n: number) => due <= iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
  if (within(3)) return { label: "Vence em breve", tone: "text-orange-500" };
  return t.due.remind !== null && t.due.remind !== undefined && within(t.due.remind) ? { label: "Lembrete", tone: "text-[var(--n-accent)]" } : null;
}

export function Inbox() {
  const qc = useQueryClient();
  const supabase = createClient();
  const [me, setMe] = useState<{ id: string; names: string[] } | null>(null);
  const [tab, setTab] = useState<"alerts" | "emails">("alerts");
  const [show, setShow] = useState<"unread" | "all" | "archived">("all");
  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (u) setMe({ id: u.id, names: [u.user_metadata?.full_name, u.email].filter(Boolean) });
    });
  }, []);

  const list = useQuery({
    queryKey: ["notifications"],
    retry: false,
    queryFn: async () => {
      const cols = "id,kind,page_id,body,read_at,created_at";
      const query = (c: string) => supabase.from("notifications").select(c).order("created_at", { ascending: false }).limit(200);
      let { data, error } = await query(`${cols},archived_at`);
      // Sem a migration 0015 não há como arquivar; o resto continua funcionando.
      const canArchive = error?.code !== "42703";
      if (!canArchive) ({ data, error } = await query(cols));
      if (error) throw error;
      return { items: data as unknown as Notification[], canArchive };
    },
  });
  // De onde vem cada aviso: tarefa solta ou já excluída abria uma página em branco sem explicação.
  const pageIds = [...new Set((list.data?.items ?? []).map((n) => n.page_id).filter((x): x is string => Boolean(x)))];
  const places = useQuery({
    queryKey: ["notification-pages", pageIds.join()],
    enabled: pageIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("pages").select("id,title,parent_id,is_archived").in("id", pageIds);
      const found = (data ?? []) as { id: string; parent_id: string | null; is_archived: boolean }[];
      const parents = [...new Set(found.map((p) => p.parent_id).filter((x): x is string => Boolean(x)))];
      const { data: up } = parents.length ? await supabase.from("pages").select("id,title,is_database,is_archived").in("id", parents) : { data: [] };
      return { found, parents: (up ?? []) as { id: string; title: string; is_database: boolean; is_archived: boolean }[] };
    },
  });
  const placeOf = (pageId: string | null): { text: string; gone?: boolean } | null => {
    if (!pageId || !places.data) return null;
    const p = places.data.found.find((x) => x.id === pageId);
    if (!p) return { text: "Página excluída", gone: true };
    if (p.is_archived) return { text: "Na lixeira", gone: true };
    const parent = places.data.parents.find((x) => x.id === p.parent_id);
    if (parent?.is_database && !parent.is_archived) return { text: `em ${parent.title || "Sem título"}` };
    if (parent?.is_database) return { text: "Banco de origem excluído" };
    return { text: parent ? `em ${parent.title || "Sem título"}` : "Página fora de um banco" };
  };
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: () => loadTasks() });
  const alerts = useMemo(() => (tasks.data?.tasks ?? [])
    .filter((t) => !t.done && isAssignedTo(t.people, me))
    .map((t) => ({ task: t, alert: dueAlert(t) }))
    .filter((x) => x.alert)
    .sort((a, b) => (a.task.due!.start < b.task.due!.start ? -1 : 1)), [tasks.data, me]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["notifications"] }); qc.invalidateQueries({ queryKey: ["unread"] }); };
  const update = useMutation({
    mutationFn: async ({ ids, patch, onlyUnread }: { ids: string[]; patch: Partial<Notification>; onlyUnread?: boolean }) => {
      let q = supabase.from("notifications").update(patch).in("id", ids);
      if (onlyUnread) q = q.is("read_at", null);
      const { error } = await q;
      if (error) throw error;
    },
    onMutate: ({ ids, patch, onlyUnread }) => {
      qc.setQueryData<{ items: Notification[]; canArchive: boolean }>(["notifications"], (old) => old && {
        ...old, items: old.items.map((n) => (ids.includes(n.id) && (!onlyUnread || !n.read_at) ? { ...n, ...patch } : n)),
      });
    },
    onSettled: refresh,
  });
  const now = () => new Date().toISOString();
  const markRead = (ids: string[]) => update.mutate({ ids, patch: { read_at: now() }, onlyUnread: true });
  const markUnread = (ids: string[]) => update.mutate({ ids, patch: { read_at: null } });
  // Arquivar também conta como lida: senão o contador da barra lateral nunca zerava.
  const archive = (ids: string[]) => { markRead(ids); update.mutate({ ids, patch: { archived_at: now() } }); };
  const unarchive = (ids: string[]) => update.mutate({ ids, patch: { archived_at: null } });

  const items = list.data?.items ?? [];
  const canArchive = list.data?.canArchive ?? false;
  const inbox = items.filter((n) => !n.archived_at);
  const unread = inbox.filter((n) => !n.read_at);
  const visible = show === "archived" ? items.filter((n) => n.archived_at) : show === "unread" ? unread : inbox;
  const readInInbox = inbox.filter((n) => n.read_at);
  const empty = !alerts.length && !items.length && !list.isLoading;

  return (
    <div className="mx-auto w-full max-w-[760px] p-6 pt-12 sm:px-10">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-3xl font-bold">Inbox</h1>
        <span className="ml-auto flex items-center gap-1">
          {unread.length > 0 && (
            <button type="button" onClick={() => markRead(unread.map((n) => n.id))}
              className="rounded px-2 py-1 text-xs text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]">Marcar tudo como lido</button>
          )}
          {/* Quem já conectou só a Agenda precisa autorizar o envio de novo. */}
          <button type="button" onClick={() => void connectGoogle()}
            className="rounded px-2 py-1 text-xs text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]">Autorizar e-mails pelo Gmail</button>
        </span>
      </div>

      <div className="mb-4 flex gap-1">
        {([["alerts", "Avisos"], ["emails", "E-mails"]] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}
            className={`rounded px-2 py-0.5 text-sm ${tab === id ? "bg-[var(--n-active)] font-medium" : "text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]"}`}>{label}</button>
        ))}
      </div>
      {tab === "emails" ? <EmailsPanel /> : <>
      {notMigrated(list.error as any) && <p className="mb-4 text-sm text-[var(--n-text-muted)]">Avisos de atribuição, menção e comentário ficam disponíveis depois de rodar a migration 0003.</p>}

      {items.length > 0 && (
        <section aria-label="Notificações" className="mb-6">
          <div className="mb-1 flex flex-wrap items-center gap-1">
            <h2 className="mr-2 text-sm font-semibold">Notificações</h2>
            {([["unread", `Não lidas${unread.length ? ` (${unread.length})` : ""}`], ["all", "Todas"], ...(canArchive ? [["archived", "Arquivadas"]] : [])] as [typeof show, string][]).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={show === id} onClick={() => setShow(id)}
                className={`rounded px-2 py-0.5 text-xs ${show === id ? "bg-[var(--n-active)] font-medium" : "text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]"}`}>{label}</button>
            ))}
            {canArchive && show !== "archived" && readInInbox.length > 0 && (
              <button type="button" onClick={() => archive(readInInbox.map((n) => n.id))}
                className="ml-auto rounded px-2 py-0.5 text-xs text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]">Arquivar lidas ({readInInbox.length})</button>
            )}
          </div>
          {!visible.length && (
            <p className="px-1 py-2 text-sm text-[var(--n-text-faint)]">
              {show === "unread" ? "Nenhuma notificação não lida." : show === "archived" ? "Nada arquivado." : "Nenhuma notificação na Inbox."}
            </p>
          )}
          {visible.map((n) => {
            const Icon = ICON[n.kind] ?? Bell;
            const place = placeOf(n.page_id);
            const body = (
              <>
                <Icon size={15} className="shrink-0 text-[var(--n-text-faint)]" />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${n.read_at ? "text-[var(--n-text-muted)]" : "font-medium"}`}>{n.body}</span>
                  {place && <span className={`block truncate text-[11px] ${place.gone ? "text-orange-600" : "text-[var(--n-text-faint)]"}`}>{place.text}</span>}
                </span>
                <span className="shrink-0 text-xs text-[var(--n-text-faint)]">{new Date(n.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                {!n.read_at && <span aria-label="Não lida" className="h-2 w-2 shrink-0 rounded-full bg-[var(--n-accent)]" />}
              </>
            );
            const cls = "flex min-w-0 flex-1 items-center gap-2 px-1 py-1.5 text-left text-sm";
            const mark = () => markRead([n.id]);
            const what = n.body.slice(0, 40);
            const icon = "rounded p-1 text-[var(--n-text-muted)] hover:bg-[var(--n-active)]";
            return (
              <div key={n.id} className="group flex items-center gap-1 rounded hover:bg-[var(--n-hover)]">
                {n.page_id && !place?.gone
                  ? <Link href={`/workspace/${n.page_id}`} onClick={mark} className={cls}>{body}</Link>
                  : <button type="button" onClick={mark} className={cls}>{body}</button>}
                <span className="flex shrink-0 items-center opacity-60 group-hover:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                  {n.read_at
                    ? <button type="button" aria-label={`Marcar como não lida: ${what}`} title="Marcar como não lida" onClick={() => markUnread([n.id])} className={icon}><Mail size={13} /></button>
                    : <button type="button" aria-label={`Marcar como lida: ${what}`} title="Marcar como lida" onClick={mark} className={icon}><MailOpen size={13} /></button>}
                  {canArchive && (n.archived_at
                    ? <button type="button" aria-label={`Voltar para a Inbox: ${what}`} title="Voltar para a Inbox" onClick={() => unarchive([n.id])} className={icon}><ArchiveRestore size={13} /></button>
                    : <button type="button" aria-label={`Arquivar: ${what}`} title="Arquivar" onClick={() => archive([n.id])} className={icon}><Archive size={13} /></button>)}
                </span>
              </div>
            );
          })}
          {!canArchive && <p className="mt-1 px-1 text-xs text-[var(--n-text-faint)]">Para arquivar notificações, rode a migration 0015 no Supabase.</p>}
        </section>
      )}

      {alerts.length > 0 && (
        <section aria-label="Prazos" className="mb-6">
          <h2 className="mb-1 text-sm font-semibold">Prazos</h2>
          {alerts.slice(0, ALERTS_SHOWN).map(({ task, alert }) => (
            <Link key={task.id} href={`/workspace/${task.id}`} className="flex items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-[var(--n-hover)]">
              <AlarmClock size={15} className={`shrink-0 ${alert!.tone}`} />
              <span className="min-w-0 flex-1 truncate">{task.title || "Sem título"}</span>
              <span className={`shrink-0 text-xs ${alert!.tone}`}>{alert!.label} · {formatDateValue(task.due)}</span>
            </Link>
          ))}
          {alerts.length > ALERTS_SHOWN && <Link href="/tarefas" className="mt-1 block px-1 text-xs text-[var(--n-accent)] hover:underline">Ver todos os {alerts.length} prazos em Minhas tarefas</Link>}
        </section>
      )}

      {empty && (
        <div className="rounded-lg border border-dashed border-[var(--n-border)] p-8 text-center">
          <Bell size={28} className="mx-auto mb-2 text-[var(--n-text-faint)]" />
          <p className="text-sm text-[var(--n-text-muted)]">Nada por aqui. Atribuições, menções, comentários e prazos aparecem nesta tela.</p>
        </div>
      )}
      </>}
    </div>
  );
}
