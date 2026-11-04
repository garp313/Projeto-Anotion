"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usePageTree } from "@/lib/hooks/usePageTree";
import { completeTask, createTaskTemplate, loadTasks, type Task } from "@/lib/tasks";
import { formatDateValue } from "@/components/database/values";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

type Bucket = { id: string; label: string; tone?: string; tasks: Task[] };

function bucketize(tasks: Task[]): Bucket[] {
  const now = new Date();
  const today = iso(now);
  const weekEnd = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - now.getDay())));
  const buckets: Bucket[] = [
    { id: "late", label: "Atrasadas", tone: "text-red-500", tasks: [] },
    { id: "today", label: "Hoje", tone: "text-orange-500", tasks: [] },
    { id: "week", label: "Esta semana", tasks: [] },
    { id: "later", label: "Depois", tasks: [] },
    { id: "none", label: "Sem prazo", tasks: [] },
  ];
  const at = (id: string) => buckets.find((b) => b.id === id)!.tasks;
  for (const t of tasks) {
    const due = (t.due?.end ?? t.due?.start)?.slice(0, 10);
    if (!due) at("none").push(t);
    else if (due < today) at("late").push(t);
    else if (due === today) at("today").push(t);
    else if (due <= weekEnd) at("week").push(t);
    else at("later").push(t);
  }
  buckets.forEach((b) => b.tasks.sort((x, y) => (x.due?.start ?? "").localeCompare(y.due?.start ?? "")));
  return buckets.filter((b) => b.tasks.length);
}

export function MyTasks() {
  const router = useRouter();
  const qc = useQueryClient();
  const { workspace } = usePageTree();
  const [me, setMe] = useState<{ id: string; names: string[] } | null>(null);

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (u) setMe({ id: u.id, names: [u.user_metadata?.full_name, u.email].filter(Boolean) });
    });
  }, []);

  const { data, isLoading, error } = useQuery({ queryKey: ["tasks"], queryFn: loadTasks });

  const complete = useMutation({
    mutationFn: completeTask,
    onSuccess: (_r, t) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["database_rows", t.databaseId] });
    },
  });
  const template = useMutation({
    mutationFn: () => createTaskTemplate(workspace.data!.id),
    onSuccess: (id) => { qc.invalidateQueries({ queryKey: ["pages"] }); router.push(`/workspace/${id}`); },
  });

  const mine = useMemo(
    () => (data?.tasks ?? []).filter((t) => !t.done && t.people.some((p) => p.id === me?.id || me?.names.includes(p.name))),
    [data, me]
  );
  const buckets = useMemo(() => bucketize(mine), [mine]);

  return (
    <div className="mx-auto w-full max-w-[760px] p-6 pt-12 sm:px-10">
      <h1 className="mb-1 text-3xl font-bold">Minhas tarefas</h1>
      <p className="mb-6 text-sm text-[var(--n-text-muted)]">Tudo que está atribuído a você e ainda não foi concluído.</p>

      {error ? <p role="alert" className="text-sm text-red-500">Não foi possível carregar as tarefas.</p>
        : isLoading || !me ? <div className="h-40 animate-pulse rounded bg-[var(--n-hover)]/40" />
        : !buckets.length ? (
          <div className="rounded-lg border border-dashed border-[var(--n-border)] p-8 text-center">
            <ListChecks size={28} className="mx-auto mb-2 text-[var(--n-text-faint)]" />
            <p className="mb-3 text-sm text-[var(--n-text-muted)]">
              {data?.hasDatabases ? "Nenhuma tarefa pendente com você como Responsável." : "Você ainda não tem um banco de tarefas."}
            </p>
            <button type="button" disabled={template.isPending || !workspace.data} onClick={() => template.mutate()}
              className="rounded-md bg-[var(--n-accent)] px-3 py-1.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-60">
              {template.isPending ? "Criando…" : "Criar bancos de Tarefas e Projetos"}
            </button>
            {template.isError && <p role="alert" className="mt-2 text-xs text-red-500">Não foi possível criar o modelo.</p>}
          </div>
        ) : buckets.map((b) => (
          <section key={b.id} aria-label={b.label} className="mb-6">
            <h2 className={`mb-1 text-sm font-semibold ${b.tone ?? ""}`}>
              {b.label} <span className="font-normal text-[var(--n-text-faint)]">{b.tasks.length}</span>
            </h2>
            {b.tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-[var(--n-hover)]">
                {t.doneOption && (
                  <button type="button" aria-label={`Concluir ${t.title || "tarefa"}`} onClick={() => complete.mutate(t)}
                    className="group grid h-4 w-4 shrink-0 place-items-center rounded border border-[var(--n-text-faint)] hover:border-[var(--n-accent)]">
                    <Check size={11} className="opacity-0 group-hover:opacity-100" />
                  </button>
                )}
                <Link href={`/workspace/${t.id}`} className="min-w-0 flex-1 truncate text-sm">{t.icon} {t.title || "Sem título"}</Link>
                <span className="shrink-0 truncate text-xs text-[var(--n-text-faint)]">{t.databaseTitle}</span>
                {t.due && <span className={`shrink-0 text-xs ${b.tone ?? "text-[var(--n-text-muted)]"}`}>{formatDateValue(t.due)}</span>}
              </div>
            ))}
          </section>
        ))}
    </div>
  );
}
