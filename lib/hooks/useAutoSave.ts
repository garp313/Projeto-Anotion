"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { scheduleEmails } from "@/lib/collab";
import { saveErrorMessage, toast } from "@/lib/toast";

export type SaveStatus = "saved" | "saving" | "error" | "conflict";

/** Pedido do aviso de conflito: "manter a minha versão" regrava por cima da outra pessoa. */
export const FORCE_SAVE = "force-save";

export function useAutoSave(pageId: string, delay = 800) {
  const supabase = useRef(createClient()).current;
  const qc = useQueryClient();
  const [status, setStatus] = useState<SaveStatus>("saved");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<unknown>(null);
  const last = useRef<unknown>(null);
  const saving = useRef(false);
  const conflict = useRef(false);

  const write = useCallback(async (content: unknown, force: boolean) => {
    const base: number | undefined = qc.getQueryData<any>(["page", pageId])?.content_rev;
    if (base === undefined) {
      // Banco sem a migration 0009.
      const { error } = await supabase.from("pages").update({ content_json: content }).eq("id", pageId);
      return error;
    }
    const { data, error } = await supabase.rpc("save_content", { p_page: pageId, p_content: content, p_base: force ? null : base });
    if (!error) qc.setQueryData<any>(["page", pageId], (old: any) => (old ? { ...old, content_rev: data } : old));
    return error;
  }, [pageId, supabase, qc]);

  const flush = useCallback(async (force = false) => {
    // Um envio por vez: dois juntos partiriam da mesma versão e o segundo daria conflito falso.
    if (saving.current || pending.current === null || (conflict.current && !force)) return;
    const content = pending.current;
    pending.current = null;
    last.current = content;
    saving.current = true;
    // sem isto, reabrir a página mostraria (e depois gravaria) a versão antiga do cache
    qc.setQueryData<any>(["page", pageId], (old: any) => (old ? { ...old, content_json: content } : old));
    const error = await write(content, force);
    saving.current = false;
    if (error?.code === "40001") {
      conflict.current = true;
      pending.current = content;
      return setStatus("conflict");
    }
    conflict.current = false;
    if (error) toast({ message: saveErrorMessage(error), tone: "error" });
    setStatus(error ? "error" : pending.current === null ? "saved" : "saving");
    if (!error && JSON.stringify(content).includes('"kind":"person"')) scheduleEmails();
    if (pending.current !== null) void flush();
  }, [pageId, qc, write]);

  const save = useCallback(
    (content: unknown) => {
      pending.current = content;
      if (conflict.current) return;
      setStatus("saving");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [flush, delay]
  );

  useEffect(() => {
    const keep = (e: Event) => { if ((e as CustomEvent).detail === pageId) void flush(true); };
    window.addEventListener(FORCE_SAVE, keep);
    return () => window.removeEventListener(FORCE_SAVE, keep);
  }, [flush, pageId]);

  // salva o que estiver pendente ao trocar de página/desmontar
  useEffect(() => () => { clearTimeout(timer.current); void flush(); }, [flush]);

  return { save, status };
}
