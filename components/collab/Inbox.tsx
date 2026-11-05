"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, AtSign, Bell, CircleDot, MessageSquare, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { connectGoogle, notMigrated, type Notification } from "@/lib/collab";
import { loadTasks, type Task } from "@/lib/tasks";
import { formatDateValue } from "@/components/database/values";
import { EmailsPanel } from "./EmailsPanel";

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
      const { data, error } = await supabase.from("notifications").select("id,kind,page_id,body,read_at,created_at")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as Notification[];
    },
  });
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: () => loadTasks() });
  const alerts = useMemo(() => (tasks.data?.tasks ?? [])
    .filter((t) => !t.done && t.people.some((p) => p.id === me?.id || me?.names.includes(p.name)))
    .map((t) => ({ task: t, alert: dueAlert(t) }))
    .filter((x) => x.alert)
    .sort((a, b) => (a.task.due!.start < b.task.due!.start ? -1 : 1)), [tasks.data, me]);

  const read = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notifications"] }); qc.invalidateQueries({ queryKey: ["unread"] }); },
  });
  const unread = (list.data ?? []).filter((n) => !n.read_at);
  const empty = !alerts.length && !list.data?.length && !list.isLoading;

  return (
    <div className="mx-auto w-full max-w-[760px] p-6 pt-12 sm:px-10">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-3xl font-bold">Inbox</h1>
        <span className="ml-auto flex items-center gap-1">
          {unread.length > 0 && (
            <button type="button" onClick={() => read.mutate(unread.map((n) => n.id))}
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

      {list.data && list.data.length > 0 && (
        <section aria-label="Notificações" className="mb-6">
          <h2 className="mb-1 text-sm font-semibold">Notificações</h2>
          {list.data.map((n) => {
            const Icon = ICON[n.kind];
            const body = (
              <>
                <Icon size={15} className="shrink-0 text-[var(--n-text-faint)]" />
                <span className={`min-w-0 flex-1 truncate ${n.read_at ? "text-[var(--n-text-muted)]" : "font-medium"}`}>{n.body}</span>
                <span className="shrink-0 text-xs text-[var(--n-text-faint)]">{new Date(n.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                {!n.read_at && <span aria-label="Não lida" className="h-2 w-2 shrink-0 rounded-full bg-[var(--n-accent)]" />}
              </>
            );
            const cls = "flex items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-[var(--n-hover)]";
            const mark = () => { if (!n.read_at) read.mutate([n.id]); };
            return n.page_id
              ? <Link key={n.id} href={`/workspace/${n.page_id}`} onClick={mark} className={cls}>{body}</Link>
              : <button key={n.id} type="button" onClick={mark} className={`${cls} w-full text-left`}>{body}</button>;
          })}
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
