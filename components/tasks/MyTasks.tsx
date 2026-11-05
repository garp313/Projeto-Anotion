"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usePageTree } from "@/lib/hooks/usePageTree";
import { createTaskTemplate, loadTasks, setTaskStatus, type Task } from "@/lib/tasks";
import { Choice, OptionTag, Pop, menuItem } from "@/components/database/ui";
import { isAssignedTo } from "@/lib/assignee";
import { useMembers } from "@/lib/collab";
import { formatDateValue } from "@/components/database/values";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const urgency = (t: Task) => (/alta|high/i.test(t.priority?.value ?? "") ? 2 : /m[eé]dia|medium/i.test(t.priority?.value ?? "") ? 1 : 0);

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
  // Dentro do grupo, o mais urgente primeiro; em prioridade igual, o prazo mais antigo.
  buckets.forEach((b) => b.tasks.sort((x, y) => urgency(y) - urgency(x) || (x.due?.start ?? "").localeCompare(y.due?.start ?? "")));
  return buckets.filter((b) => b.tasks.length);
}

function StatusPicker({ task, onPick }: { task: Task; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!task.statusOptions.length) return null;
  return (
    <Pop open={open} onOpenChange={setOpen} width={190} align="end" triggerClass="shrink-0 rounded hover:brightness-95"
      trigger={<span aria-label={`Status de ${task.title || "tarefa"}`}>{task.statusOption ? <OptionTag option={task.statusOption} /> : <span className="text-xs text-[var(--n-text-faint)]">Sem status</span>}</span>}>
      {task.statusOptions.map((o) => (
        <button key={o.id} type="button" className={menuItem} onClick={() => { setOpen(false); onPick(o.id); }}><OptionTag option={o} /></button>
      ))}
    </Pop>
  );
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

  const { data, isLoading, error } = useQuery({ queryKey: ["tasks"], queryFn: () => loadTasks() });

  // Status de antes de concluir: desmarcar devolve a tarefa para onde ela estava.
  const previous = useRef(new Map<string, string>());
  const changeStatus = useMutation({
    mutationFn: ({ task, id }: { task: Task; id: string }) => setTaskStatus(task, id),
    // A tela muda na hora: sem isso a tarefa ficava parada até a resposta do banco.
    onMutate: ({ task, id }) => {
      const option = task.statusOptions.find((o) => o.id === id);
      qc.setQueryData<Awaited<ReturnType<typeof loadTasks>>>(["tasks"], (old) => old && {
        ...old,
        tasks: old.tasks.map((t) => (t.id === task.id ? { ...t, statusOption: option, done: option?.group === "complete" } : t)),
      });
    },
    onSettled: (_r, _e, { task }) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["database_rows", task.databaseId] });
    },
  });
  const finish = (t: Task) => {
    if (!t.doneOption) return;
    if (t.statusOption) previous.current.set(t.id, t.statusOption.id);
    changeStatus.mutate({ task: t, id: t.doneOption.id });
  };
  const reopen = (t: Task) => {
    const id = previous.current.get(t.id) ?? t.statusOptions.find((o) => (o.group ?? "todo") === "todo")?.id;
    if (id) changeStatus.mutate({ task: t, id });
  };
  const template = useMutation({
    mutationFn: () => createTaskTemplate(workspace.data!.id),
    onSuccess: (id) => { qc.invalidateQueries({ queryKey: ["pages"] }); router.push(`/workspace/${id}`); },
  });

  const { data: members = [] } = useMembers();
  const assigned = useMemo(() => {
    // O nome do perfil do time vale junto com o da sessão.
    const profile = members.filter((m) => m.id === me?.id).flatMap((m) => [m.name, m.email]);
    const who = me && { id: me.id, names: [...me.names, ...profile].filter(Boolean) };
    return (data?.tasks ?? []).filter((t) => isAssignedTo(t.people, who));
  }, [data, me, members]);
  const [project, setProject] = useState("");
  const projectNames = useMemo(() => [...new Set(assigned.flatMap((t) => t.projects))].sort(), [assigned]);
  const buckets = useMemo(() => {
    // Toda demanda atribuída entra por prazo, venha do banco que vier.
    return bucketize(assigned.filter((t) => !t.done && (!project || t.projects.includes(project))));
  }, [assigned, project]);
  const finished = useMemo(() => assigned.filter((t) => t.done), [assigned]);

  return (
    <div className="mx-auto w-full max-w-[760px] p-6 pt-12 sm:px-10">
      <h1 className="mb-1 text-3xl font-bold">Minhas tarefas</h1>
      <p className="mb-4 text-sm text-[var(--n-text-muted)]">Tudo que está atribuído a você.</p>
      {projectNames.length > 0 && (
        <div className="mb-6 w-fit">
          <Choice label="Filtrar por projeto" width={240} value={project} onChange={setProject}
            options={[{ value: "", label: "Todos os projetos" }, ...projectNames.map((p) => ({ value: p, label: p }))]} />
        </div>
      )}

      {error ? <p role="alert" className="text-sm text-red-500">Não foi possível carregar as tarefas.</p>
        : isLoading || !me ? <div className="h-40 animate-pulse rounded bg-[var(--n-hover)]/40" />
        : !buckets.length && !finished.length ? (
          <div className="rounded-lg border border-dashed border-[var(--n-border)] p-8 text-center">
            <ListChecks size={28} className="mx-auto mb-2 text-[var(--n-text-faint)]" />
            <p className="mb-3 text-sm text-[var(--n-text-muted)]">
              {data?.hasDatabases ? "Nenhuma tarefa pendente com você como Responsável." : "Você ainda não tem um banco de tarefas."}
            </p>
            {/* Com o banco Tarefas criado, este botão só geraria uma cópia de tudo. */}
            {!data?.hasTaskDatabase && (
              <button type="button" disabled={template.isPending || !workspace.data} onClick={() => template.mutate()}
                className="rounded-md bg-[var(--n-accent)] px-3 py-1.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-60">
                {template.isPending ? "Criando…" : "Criar bancos de Tarefas e Projetos"}
              </button>
            )}
            {template.isError && <p role="alert" className="mt-2 text-xs text-red-500">Não foi possível criar o modelo.</p>}
          </div>
        ) : <>{!buckets.length && <p className="mb-6 text-sm text-[var(--n-text-muted)]">Nada pendente com você.</p>}{buckets.map((b) => (
          <section key={b.id} aria-label={b.label} className="mb-6">
            <h2 className={`mb-1 text-sm font-semibold ${b.tone ?? ""}`}>
              {b.label} <span className="font-normal text-[var(--n-text-faint)]">{b.tasks.length}</span>
            </h2>
            {b.tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-[var(--n-hover)]">
                {t.doneOption && (
                  <button type="button" aria-label={`Concluir ${t.title || "tarefa"}`} onClick={() => finish(t)}
                    className="group grid h-4 w-4 shrink-0 place-items-center rounded border border-[var(--n-text-faint)] hover:border-[var(--n-accent)]">
                    <Check size={11} className="opacity-0 group-hover:opacity-100" />
                  </button>
                )}
                <Link href={`/workspace/${t.id}`} className="min-w-0 flex-1 truncate text-sm">{t.icon} {t.title || "Sem título"}</Link>
                <span className="hidden max-w-[120px] shrink-0 truncate text-xs text-[var(--n-text-faint)] sm:inline" title={t.projects[0] ?? t.databaseTitle}>{t.projects[0] ?? t.databaseTitle}</span>
                {t.priority && <OptionTag option={t.priority} />}
                <StatusPicker task={t} onPick={(id) => changeStatus.mutate({ task: t, id })} />
                {t.due && <span className={`shrink-0 text-xs ${b.tone ?? "text-[var(--n-text-muted)]"}`}>{formatDateValue(t.due)}</span>}
              </div>
            ))}
          </section>
        ))}
        {finished.length > 0 && (
          <section aria-label="Concluídas" className="mb-6">
            <h2 className="mb-1 text-sm font-semibold text-[var(--n-text-muted)]">
              Concluídas <span className="font-normal text-[var(--n-text-faint)]">{finished.length}</span>
            </h2>
            {finished.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-[var(--n-hover)]">
                <button type="button" aria-label={`Reabrir ${t.title || "tarefa"}`} title="Reabrir" onClick={() => reopen(t)}
                  className="grid h-4 w-4 shrink-0 place-items-center rounded border border-[var(--n-accent)] bg-[var(--n-accent)] text-white">
                  <Check size={11} />
                </button>
                <Link href={`/workspace/${t.id}`} className="min-w-0 flex-1 truncate text-sm text-[var(--n-text-faint)] line-through">{t.icon} {t.title || "Sem título"}</Link>
                <span className="hidden max-w-[120px] shrink-0 truncate text-xs text-[var(--n-text-faint)] sm:inline" title={t.databaseTitle}>{t.databaseTitle}</span>
              </div>
            ))}
          </section>
        )}</>}
    </div>
  );
}
