"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Search } from "lucide-react";
import { connectGoogle } from "@/lib/collab";
import { usePageTree } from "@/lib/hooks/usePageTree";
import { Choice, fieldClass } from "@/components/database/ui";

type Message = { id: string; subject: string; from: string; date: string; snippet: string; pageId: string | null };

async function search(q: string): Promise<{ messages?: Message[]; error?: string }> {
  const res = await fetch(`/api/gmail/messages?q=${encodeURIComponent(q)}`);
  return res.json();
}

/** Procura no Gmail e transforma o e-mail em tarefa no banco escolhido. */
export function EmailsPanel() {
  const qc = useQueryClient();
  const { pages } = usePageTree();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const databases = useMemo(() => {
    const all = pages.data ?? [];
    const dbIds = new Set(all.filter((p) => p.is_database).map((p) => p.id));
    return all.filter((p) => p.is_database && !(p.parent_id && dbIds.has(p.parent_id)));
  }, [pages.data]);
  const [picked, setPicked] = useState<string | null>(null);
  const target = picked ?? databases.find((d) => d.title === "Tarefas")?.id ?? databases[0]?.id ?? "";

  const list = useQuery({ queryKey: ["gmail", q], queryFn: () => search(q), retry: false });
  const toTask = useMutation({
    mutationFn: async (messageId: string) => {
      const res = await fetch("/api/gmail/to-task", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, databaseId: target }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gmail", q] });
      qc.invalidateQueries({ queryKey: ["database_rows", target] });
      qc.invalidateQueries({ queryKey: ["pages"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const error = list.data?.error;
  if (error === "api_disabled") {
    return (
      <div role="alert" className="rounded-lg border border-dashed border-[var(--n-border)] p-6 text-center">
        <Mail size={24} className="mx-auto mb-2 text-[var(--n-text-faint)]" />
        <p className="mb-2 text-sm text-[var(--n-text-muted)]">A Gmail API está desligada no projeto do Google Cloud. Quem administra o app precisa ativá-la.</p>
        <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noreferrer" className="text-sm text-[var(--n-accent)] underline">Abrir a Gmail API</a>
      </div>
    );
  }
  if (error === "not_connected" || error === "needs_scope") {
    return (
      <div className="rounded-lg border border-dashed border-[var(--n-border)] p-6 text-center">
        <Mail size={24} className="mx-auto mb-2 text-[var(--n-text-faint)]" />
        <p className="mb-3 text-sm text-[var(--n-text-muted)]">
          {error === "needs_scope"
            ? "O Google não liberou a leitura do Gmail. Autorize de novo e marque todas as caixas na tela do Google."
            : "Autorize a leitura do Gmail para transformar e-mails em tarefas."}
        </p>
        <button type="button" onClick={() => void connectGoogle()} className="rounded-md bg-[var(--n-accent)] px-3 py-1.5 text-sm font-medium text-white hover:brightness-95">Autorizar Gmail</button>
      </div>
    );
  }

  return (
    <section aria-label="E-mails">
      <form className="mb-2 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); setQ(text.trim()); }}>
        <span className="flex min-w-[200px] flex-1 items-center gap-1">
          <Search size={14} className="shrink-0 text-[var(--n-text-faint)]" />
          <input aria-label="Buscar no Gmail" value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar no Gmail (Enter)" className={fieldClass} />
        </span>
        {databases.length > 0 && (
          <Choice label="Banco de destino" value={target} onChange={setPicked} options={databases.map((d) => ({ value: d.id, label: d.title || "Sem título" }))} />
        )}
      </form>

      {!databases.length && <p className="mb-2 text-sm text-[var(--n-text-muted)]">Crie um banco de dados para receber as tarefas.</p>}
      {error && <p role="alert" className="text-sm text-red-500">Não foi possível ler o Gmail agora.</p>}
      {toTask.isError && <p role="alert" className="mb-1 text-sm text-red-500">Não foi possível criar a tarefa.</p>}
      {list.isLoading && <div className="h-24 animate-pulse rounded bg-[var(--n-hover)]/40" />}
      {list.data?.messages?.length === 0 && <p className="py-6 text-center text-sm text-[var(--n-text-faint)]">Nenhum e-mail encontrado.</p>}

      {list.data?.messages?.map((m) => (
        <div key={m.id} className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-[var(--n-hover)]">
          <span className="min-w-0 flex-1">
            <span title={m.subject} className="block truncate text-sm font-medium">{m.subject || "(Sem assunto)"}</span>
            <span title={m.from} className="block truncate text-xs text-[var(--n-text-muted)]">{m.from}</span>
          </span>
          {m.pageId
            ? <Link href={`/workspace/${m.pageId}`} className="shrink-0 rounded px-2 py-1 text-xs text-[var(--n-accent)] hover:bg-[var(--n-hover)]">Abrir tarefa</Link>
            : <button type="button" disabled={!target || toTask.isPending} onClick={() => toTask.mutate(m.id)}
                className="shrink-0 rounded border border-[var(--n-border)] px-2 py-1 text-xs hover:bg-[var(--n-active)] disabled:opacity-50">Virar tarefa</button>}
        </div>
      ))}
    </section>
  );
}
