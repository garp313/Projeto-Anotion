"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type SaveStatus = "saved" | "saving" | "error";

export function useAutoSave(pageId: string, delay = 800) {
  // Inicialização direta (o createClient do @/lib/supabase/client já lida com o cache no client-side)
  const supabase = createClient();
  const [status, setStatus] = useState<SaveStatus>("saved");
  
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<unknown>(null);
  const isSaving = useRef(false);
  const isMounted = useRef(true);

  // Monitora se o componente continua em tela para evitar memory leaks
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const flush = useCallback(async () => {
    // Bloqueia se não houver nada para salvar ou se JÁ estiver salvando (evita duplicação)
    if (pending.current === null || isSaving.current) return;
    
    const content = pending.current;
    pending.current = null;
    isSaving.current = true;
    
    const { error } = await supabase
      .from("pages")
      .update({ content_json: content })
      .eq("id", pageId);

    isSaving.current = false;

    // Só atualiza o status se o usuário ainda estiver na página
    if (isMounted.current) {
      setStatus(error ? "error" : pending.current !== null ? "saving" : "saved");
    }

    // Se o usuário digitou mais coisas ENQUANTO o Supabase estava salvando, processa a fila
    if (pending.current !== null) {
      flush();
    }
  }, [pageId, supabase]);

  const save = useCallback(
    (content: unknown) => {
      pending.current = content;
      if (isMounted.current && status !== "saving") setStatus("saving");
      
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [flush, delay, status]
  );

  // Força o salvamento final ao trocar de página sem tentar atualizar estados visuais
  useEffect(() => {
    return () => {
      clearTimeout(timer.current);
      if (pending.current !== null) {
        void flush();
      }
    };
  }, [flush]);

  return { save, status };
}