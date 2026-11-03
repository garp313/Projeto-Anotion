"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type SaveStatus = "saved" | "saving" | "error";

export function useAutoSave(pageId: string, delay = 800) {
  const supabase = useRef(createClient()).current;
  const [status, setStatus] = useState<SaveStatus>("saved");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<unknown>(null);

  const flush = useCallback(async () => {
    if (pending.current === null) return;
    const content = pending.current;
    pending.current = null;
    const { error } = await supabase.from("pages").update({ content_json: content }).eq("id", pageId);
    setStatus(error ? "error" : pending.current === null ? "saved" : "saving");
  }, [pageId, supabase]);

  const save = useCallback(
    (content: unknown) => {
      pending.current = content;
      setStatus("saving");
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [flush, delay]
  );

  // salva o que estiver pendente ao trocar de página/desmontar
  useEffect(() => () => { clearTimeout(timer.current); void flush(); }, [flush]);

  return { save, status };
}
