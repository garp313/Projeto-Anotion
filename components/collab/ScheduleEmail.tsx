"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Send, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { connectGoogle, memberName, notMigrated, useMembers } from "@/lib/collab";
import { Choice, Pop, fieldClass, toolbarBtn } from "@/components/database/ui";
import { DateText } from "@/components/database/DatePicker";
import { REPEAT_LABEL, addDays, todayInBrazil, type Repeat, type ScheduledEmail } from "@/lib/scheduledEmail";

const REPEATS = (Object.keys(REPEAT_LABEL) as Repeat[]).map((value) => ({ value, label: REPEAT_LABEL[value] }));
const toBr = (date: string) => date.split("-").reverse().join("/");

export function ScheduleEmail({ pageId, title }: { pageId: string; title: string }) {
  const qc = useQueryClient();
  const key = ["scheduled_emails", pageId];
  const { data: members = [] } = useMembers();
  const [picked, setPicked] = useState<string[]>([]);
  const [subject, setSubject] = useState<string | null>(null);
  const [message, setMessage] = useState("Olá! Por favor, preencha a planilha desta página.");
  const [date, setDate] = useState(() => addDays(todayInBrazil(), 1));
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [note, setNote] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const subjectText = subject ?? `Preencher: ${title || "Sem título"}`;

  const list = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await createClient().from("scheduled_emails").select("*").eq("page_id", pageId).eq("active", true).order("send_on");
      if (error) throw error;
      return data as ScheduledEmail[];
    },
    retry: false,
  });
  const missing = notMigrated(list.error as { code?: string } | null);

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await createClient().from("scheduled_emails").insert({
        page_id: pageId, recipients: picked, subject: subjectText.trim(), message: message.trim(), first_send_on: date, send_on: date, repeat,
      });
      if (error) throw error;
    },
    onSuccess: () => { setPicked([]); setNote("E-mail programado."); qc.invalidateQueries({ queryKey: key }); },
    onError: () => setNote("Não foi possível programar. Tente de novo."),
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from("scheduled_emails").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: () => setNote("Não foi possível cancelar. Tente de novo."),
  });
  const sendNow = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/scheduled-emails/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      return await res.json() as { sent?: number; failed?: number; reason?: string };
    },
    onSuccess: (r) => {
      setDisconnected(r.reason === "not_connected");
      setNote(r.sent ? `Enviado para ${r.sent} pessoa(s).${r.failed ? ` ${r.failed} não receberam.` : ""}` : "Nada foi enviado.");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: () => setNote("Não foi possível enviar. Tente de novo."),
  });

  const submit = () => {
    setNote(null);
    if (!picked.length) return setNote("Escolha ao menos uma pessoa.");
    if (!subjectText.trim() || !message.trim()) return setNote("Preencha o assunto e a mensagem.");
    if (date <= todayInBrazil()) return setNote("Escolha uma data a partir de amanhã. Para hoje, programe e use Enviar agora.");
    create.mutate();
  };
  const toggle = (email: string) => setPicked((p) => (p.includes(email) ? p.filter((x) => x !== email) : [...p, email]));
  const label = "mb-0.5 block text-xs text-[var(--n-text-muted)]";

  return (
    <Pop width={360} align="end" triggerClass={`${toolbarBtn} shrink-0`} trigger={<><Mail size={13} /> <span className="hidden sm:inline">Programar e-mail</span></>}>
      <div className="max-h-[70vh] space-y-2 overflow-y-auto p-1 text-sm">
        {missing ? <p role="alert" className="text-xs text-red-500">Falta rodar a migration 0012 no Supabase.</p> : (
          <>
            <div role="group" aria-label="Destinatários">
              <span className={label}>Para</span>
              <div className="max-h-32 overflow-y-auto rounded border border-[var(--n-border)] p-1">
                {members.filter((m) => m.email).map((m) => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-[var(--n-hover)]">
                    <input type="checkbox" checked={picked.includes(m.email)} onChange={() => toggle(m.email)} />
                    <span className="truncate">{memberName(m)}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="block"><span className={label}>Assunto</span>
              <input value={subjectText} maxLength={200} onChange={(e) => setSubject(e.target.value)} className={fieldClass} /></label>
            <label className="block"><span className={label}>Mensagem</span>
              <textarea value={message} maxLength={5000} rows={3} onChange={(e) => setMessage(e.target.value)} className={`${fieldClass} resize-y`} /></label>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1"><span className={label}>Enviar em</span><DateText label="Data do envio" value={date} onCommit={setDate} /></div>
              <div><span className={label}>Repetir</span><Choice label="Repetir" value={repeat} options={REPEATS} onChange={setRepeat} /></div>
            </div>
            <p className="text-xs text-[var(--n-text-faint)]">Sai do seu Gmail por volta das 8h, com o link desta página.</p>
            <button type="button" disabled={create.isPending} onClick={submit}
              className="w-full rounded bg-[var(--n-accent)] px-2 py-1 text-xs font-medium text-white disabled:opacity-60">Programar</button>
            {note && <p role="status" className="text-xs text-[var(--n-text-muted)]">{note}</p>}
            {disconnected && <button type="button" onClick={() => void connectGoogle()} className="text-xs text-[var(--n-accent)] hover:underline">Conectar o Google</button>}

            {Boolean(list.data?.length) && (
              <ul aria-label="E-mails programados" className="space-y-1 border-t border-[var(--n-border)] pt-2">
                {list.data!.map((s) => (
                  <li key={s.id} className="flex items-center gap-1 text-xs">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{toBr(s.send_on)} · {s.repeat === "none" ? "uma vez" : REPEAT_LABEL[s.repeat].toLowerCase()} · {s.recipients.length} pessoa(s)</span>
                      {s.last_error && <span role="alert" className="block text-red-500">{s.last_error === "not_connected" ? "Não enviado: conecte o Google." : s.last_error === "failed" ? "Não enviado. Nova tentativa amanhã." : s.last_error}</span>}
                    </span>
                    <button type="button" aria-label="Enviar agora" title="Enviar agora" disabled={sendNow.isPending} onClick={() => sendNow.mutate(s.id)} className="rounded p-1 hover:bg-[var(--n-hover)]"><Send size={12} /></button>
                    <button type="button" aria-label="Cancelar envio" title="Cancelar envio" onClick={() => cancel.mutate(s.id)} className="rounded p-1 hover:bg-[var(--n-hover)]"><Trash2 size={12} /></button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Pop>
  );
}
