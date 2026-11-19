"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, Send, Settings, Sparkles, X } from "lucide-react";
import { useAssistant } from "@/lib/store/assistant";
import { scheduleEmails } from "@/lib/collab";
import { Choice, fieldClass } from "@/components/database/ui";
import { DEFAULT_MODEL, PROVIDER_LABEL, READ_LABEL, type ChatMsg, type ChatResponse, type KeysResponse, type Provider } from "@/lib/ai/types";

const CHAT_KEY = "anotion:ai-chat";
const PROVIDER_KEY = "anotion:ai-provider";
const PROVIDERS: Provider[] = ["claude", "gemini"];
const KEY_LINK: Record<Provider, { href: string; label: string }> = {
  claude: { href: "https://console.anthropic.com/settings/keys", label: "console.anthropic.com" },
  gemini: { href: "https://aistudio.google.com/apikey", label: "aistudio.google.com" },
};
const SUGGESTIONS = [
  "Crie um banco de Clientes com nome, e-mail, status e data do último contato",
  "Resuma esta página",
  "Quais tarefas estão atrasadas?",
];

type Saved = { messages: ChatMsg[]; pending: string[] | null };
const load = (): Saved => {
  try {
    const s = JSON.parse(localStorage.getItem(CHAT_KEY) ?? "null");
    return Array.isArray(s?.messages) ? { messages: s.messages, pending: Array.isArray(s.pending) ? s.pending : null } : { messages: [], pending: null };
  } catch { return { messages: [], pending: null }; }
};
const store = (s: Saved) => {
  try { localStorage.setItem(CHAT_KEY, JSON.stringify({ messages: s.messages.slice(-200), pending: s.pending })); } catch { /* sem armazenamento */ }
};

/** Texto da IA: quebras de linha, **negrito** e links para páginas do app. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\(\/workspace\/[0-9a-f-]{36}\)|\*\*[^*]+\*\*)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) => {
        const link = /^\[([^\]]+)\]\((\/workspace\/[0-9a-f-]{36})\)$/.exec(p);
        if (link) return <Link key={i} href={link[2]} className="text-[var(--n-accent)] underline underline-offset-2">{link[1]}</Link>;
        if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </span>
  );
}

function KeySettings({ data, onDone }: { data?: KeysResponse; onDone: () => void }) {
  const qc = useQueryClient();
  const [keys, setKeys] = useState<Record<Provider, string>>({ claude: "", gemini: "" });
  const [models, setModels] = useState<Record<Provider, string>>({ claude: "", gemini: "" });
  const [busy, setBusy] = useState<Provider | null>(null);
  const [note, setNote] = useState<Record<Provider, string | null>>({ claude: null, gemini: null });
  const setOne = <T,>(set: (fn: (s: Record<Provider, T>) => Record<Provider, T>) => void, p: Provider, v: NoInfer<T>) => set((s) => ({ ...s, [p]: v }));

  const save = async (p: Provider) => {
    setBusy(p); setOne(setNote, p, null);
    try {
      const res = await fetch("/api/ai/keys", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: p, key: keys[p], model: models[p] || data?.keys[p]?.model || DEFAULT_MODEL[p] }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) return setOne(setNote, p, r.error ?? "Não foi possível salvar.");
      setOne(setKeys, p, "");
      setOne(setNote, p, "Salvo.");
      await qc.invalidateQueries({ queryKey: ["ai-keys"] });
    } catch { setOne(setNote, p, "Sem conexão. Tente de novo."); } finally { setBusy(null); }
  };
  const remove = async (p: Provider) => {
    setBusy(p);
    await fetch(`/api/ai/keys?provider=${p}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    setOne(setNote, p, "Chave removida.");
    await qc.invalidateQueries({ queryKey: ["ai-keys"] });
  };

  return (
    <div className="space-y-4 p-3 text-sm">
      {data && !data.migrated && <p role="alert" className="text-xs text-red-500">Falta rodar a migration 0017 no Supabase.</p>}
      {data && !data.ready && <p role="alert" className="text-xs text-red-500">O servidor está sem TOKEN_ENC_KEY: não dá para guardar chaves.</p>}
      {PROVIDERS.map((p) => {
        const status = data?.keys[p];
        return (
          <section key={p} aria-label={PROVIDER_LABEL[p]} className="space-y-1.5 rounded-lg border border-[var(--n-border)] p-2.5">
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{PROVIDER_LABEL[p]}</h3>
              <span className="text-xs text-[var(--n-text-muted)]">{status ? `Conectado · ••••${status.hint}` : "Não conectado"}</span>
              {status && <button type="button" disabled={busy === p} onClick={() => void remove(p)} className="ml-auto rounded px-1.5 py-0.5 text-xs text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]">Remover</button>}
            </div>
            <input type="password" autoComplete="off" value={keys[p]} onChange={(e) => setOne(setKeys, p, e.target.value)}
              placeholder={status ? "Colar outra chave (opcional)" : "Cole a chave da API"} aria-label={`Chave do ${PROVIDER_LABEL[p]}`} className={fieldClass} />
            <label className="block text-xs text-[var(--n-text-muted)]">Modelo
              <input value={models[p]} onChange={(e) => setOne(setModels, p, e.target.value)} placeholder={status?.model ?? DEFAULT_MODEL[p]}
                aria-label={`Modelo do ${PROVIDER_LABEL[p]}`} className={`${fieldClass} mt-0.5`} />
            </label>
            <div className="flex items-center gap-2">
              <button type="button" disabled={busy === p || (!keys[p].trim() && !(status && models[p].trim()))} onClick={() => void save(p)}
                className="rounded bg-[var(--n-accent)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">
                {busy === p ? "Conferindo…" : "Salvar"}
              </button>
              <a href={KEY_LINK[p].href} target="_blank" rel="noreferrer" className="text-xs text-[var(--n-accent)] hover:underline">Pegar a chave em {KEY_LINK[p].label}</a>
            </div>
            {note[p] && <p role="status" className="text-xs text-[var(--n-text-muted)]">{note[p]}</p>}
          </section>
        );
      })}
      <p className="text-xs leading-relaxed text-[var(--n-text-faint)]">
        A chave é sua: fica cifrada no servidor, só você usa e o custo cai na sua conta da Anthropic ou do Google.
        O que a IA lê no Anotion para responder é enviado ao provedor escolhido. Ela só vê o que você já pode ver,
        e nada é criado ou alterado sem você clicar em Aplicar.
      </p>
      <button type="button" onClick={onDone} className="w-full rounded border border-[var(--n-border)] px-2 py-1 text-xs hover:bg-[var(--n-hover)]">Voltar para a conversa</button>
    </div>
  );
}

export function AssistantPanel() {
  const { open, setOpen } = useAssistant();
  const qc = useQueryClient();
  const pathname = usePathname();
  const pageId = /^\/workspace\/([0-9a-f-]{36})/.exec(pathname ?? "")?.[1] ?? null;
  const [provider, setProvider] = useState<Provider>("claude");
  const [chat, setChat] = useState<Saved>({ messages: [], pending: null });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  const keys = useQuery({
    queryKey: ["ai-keys"], enabled: open, staleTime: 60_000,
    queryFn: async (): Promise<KeysResponse> => {
      const res = await fetch("/api/ai/keys");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
  });

  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    setChat(load());
    try { const p = localStorage.getItem(PROVIDER_KEY); if (p === "claude" || p === "gemini") setProvider(p); } catch { /* padrão */ }
  }, [open]);
  useEffect(() => { if (loaded.current) store(chat); }, [chat]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [chat, busy, open]);

  // Abre direto nas configurações quando nenhuma IA foi conectada.
  const connected = PROVIDERS.filter((p) => keys.data?.keys[p]);
  useEffect(() => {
    if (keys.data && !connected.length) setSettings(true);
    else if (keys.data && !keys.data.keys[provider] && connected.length) setProvider(connected[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.data]);

  if (!open) return null;

  const pick = (p: Provider) => { setProvider(p); try { localStorage.setItem(PROVIDER_KEY, p); } catch { /* ok */ } };

  const call = async (messages: ChatMsg[], decision?: "apply" | "discard") => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, messages, pageId, decision }),
      });
      const data = await res.json().catch(() => ({})) as Partial<ChatResponse> & { dated?: string[] };
      if (!res.ok || !data.messages) { setError(data.error ?? "Não foi possível falar com o assistente."); return; }
      setChat({ messages: data.messages, pending: data.pending ?? null });
      if (data.error) setError(data.error);
      if (data.changed) {
        void qc.invalidateQueries();
        scheduleEmails();
        for (const id of (data.dated ?? []).slice(0, 30)) {
          void fetch("/api/sync/task-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId: id }) }).catch(() => null);
        }
      }
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy || chat.pending) return;
    const messages: ChatMsg[] = [...chat.messages, { role: "user", text: t }];
    setChat({ messages, pending: null });
    setInput("");
    void call(messages);
  };
  const decide = (d: "apply" | "discard") => void call(chat.messages, d);
  const reset = () => { setChat({ messages: [], pending: null }); setError(null); };

  const ready = Boolean(keys.data?.keys[provider]);

  return (
    <aside aria-label="Assistente de IA"
      className="flex h-full w-[380px] shrink-0 flex-col border-l border-[var(--n-border)] bg-[var(--n-bg)] text-[var(--n-text)] max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full">
      <header className="flex items-center gap-1 border-b border-[var(--n-border)] px-2 py-1.5">
        <Sparkles size={15} className="text-[var(--n-accent)]" />
        <h2 className="mr-auto text-sm font-medium">Assistente</h2>
        {!settings && connected.length > 1 && (
          <Choice label="IA" width={140} value={provider} options={connected.map((p) => ({ value: p, label: PROVIDER_LABEL[p] }))} onChange={pick} />
        )}
        {!settings && connected.length === 1 && <span className="text-xs text-[var(--n-text-muted)]">{PROVIDER_LABEL[provider]}</span>}
        <button type="button" title="Nova conversa" aria-label="Nova conversa" disabled={busy} onClick={reset} className="rounded p-1 hover:bg-[var(--n-hover)]"><Plus size={15} /></button>
        <button type="button" title="Configurar IA" aria-label="Configurar IA" aria-pressed={settings} onClick={() => setSettings((s) => !s)} className="rounded p-1 hover:bg-[var(--n-hover)]"><Settings size={15} /></button>
        <button type="button" title="Fechar" aria-label="Fechar assistente" onClick={() => setOpen(false)} className="rounded p-1 hover:bg-[var(--n-hover)]"><X size={15} /></button>
      </header>

      {settings ? (
        <div className="n-scroll flex-1 overflow-y-auto"><KeySettings data={keys.data} onDone={() => setSettings(false)} /></div>
      ) : (
        <>
          <div className="n-scroll flex-1 space-y-3 overflow-y-auto p-3 text-sm" aria-live="polite">
            {!chat.messages.length && (
              <div className="space-y-2 text-[var(--n-text-muted)]">
                <p>Peça para criar bancos, preencher linhas, escrever páginas ou responder sobre o que está no Anotion. Antes de alterar algo, eu mostro o que vou fazer.</p>
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" disabled={!ready || busy} onClick={() => send(s)}
                    className="block w-full rounded-lg border border-[var(--n-border)] px-2.5 py-1.5 text-left text-xs hover:bg-[var(--n-hover)] disabled:opacity-50">{s}</button>
                ))}
              </div>
            )}
            {chat.messages.map((m, i) => {
              if (m.role === "user") return <div key={i} className="ml-8 rounded-lg bg-[var(--n-hover)] px-2.5 py-1.5"><Rich text={m.text} /></div>;
              if (m.role === "tool") return null;
              const reads = (m.calls ?? []).filter((c) => READ_LABEL[c.name]);
              return (
                <div key={i} className="space-y-1">
                  {m.text && <div><Rich text={m.text} /></div>}
                  {reads.length > 0 && <p className="text-xs text-[var(--n-text-faint)]">{[...new Set(reads.map((c) => READ_LABEL[c.name]))].join(" · ")}</p>}
                </div>
              );
            })}
            {chat.pending && (
              <div role="group" aria-label="Alterações propostas" className="space-y-2 rounded-lg border border-[var(--n-accent)]/50 bg-[var(--n-callout)] p-2.5">
                <p className="text-xs font-medium">Confirme antes de aplicar:</p>
                <ul className="space-y-1.5 text-xs">{chat.pending.map((s, i) => <li key={i} className="whitespace-pre-wrap break-words">{s}</li>)}</ul>
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => decide("apply")} className="flex flex-1 items-center justify-center gap-1 rounded bg-[var(--n-accent)] px-2 py-1 text-xs font-medium text-white disabled:opacity-60"><Check size={13} /> Aplicar</button>
                  <button type="button" disabled={busy} onClick={() => decide("discard")} className="flex-1 rounded border border-[var(--n-border)] px-2 py-1 text-xs hover:bg-[var(--n-hover)] disabled:opacity-60">Descartar</button>
                </div>
              </div>
            )}
            {busy && <p className="flex items-center gap-1.5 text-xs text-[var(--n-text-muted)]"><Loader2 size={13} className="animate-spin" /> Pensando…</p>}
            {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
            <div ref={bottom} />
          </div>

          <form className="border-t border-[var(--n-border)] p-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            {!ready && keys.data && (
              <button type="button" onClick={() => setSettings(true)} className="mb-1.5 text-xs text-[var(--n-accent)] hover:underline">Conecte a sua chave do {PROVIDER_LABEL[provider]} para começar</button>
            )}
            <div className="flex items-end gap-1.5">
              <textarea value={input} rows={2} maxLength={8000} aria-label="Mensagem para o assistente"
                placeholder={chat.pending ? "Aplique ou descarte a alteração acima" : "Peça algo…"}
                disabled={!ready || Boolean(chat.pending)}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); } }}
                className={`${fieldClass} max-h-40 resize-none`} />
              <button type="submit" aria-label="Enviar" disabled={!ready || busy || !input.trim() || Boolean(chat.pending)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded bg-[var(--n-accent)] text-white disabled:opacity-50"><Send size={14} /></button>
            </div>
          </form>
        </>
      )}
    </aside>
  );
}
