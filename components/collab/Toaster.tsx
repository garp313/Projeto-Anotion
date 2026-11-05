"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { onToast, type ToastInput } from "@/lib/toast";

const DURATION = 7000;

export function Toaster() {
  const [items, setItems] = useState<(ToastInput & { id: number })[]>([]);
  const next = useRef(0);
  useEffect(() => onToast((t) => {
    const id = ++next.current;
    // Vários erros iguais em sequência viram um aviso só.
    setItems((list) => (list.some((x) => x.message === t.message) ? list : [...list.slice(-2), { ...t, id }]));
    setTimeout(() => setItems((list) => list.filter((x) => x.id !== id)), DURATION);
  }), []);
  const close = (id: number) => setItems((list) => list.filter((x) => x.id !== id));

  if (!items.length) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[95] flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} role={t.tone === "error" ? "alert" : "status"}
          className={`flex items-center gap-3 rounded-lg border bg-[var(--n-bg)] px-3 py-2 text-sm shadow-xl ${t.tone === "error" ? "border-red-500/60" : "border-[var(--n-border)]"}`}>
          <span>{t.message}</span>
          {t.action && (
            <button type="button" onClick={() => { t.action!.run(); close(t.id); }} className="rounded px-1.5 py-0.5 text-xs font-medium text-[var(--n-accent)] hover:bg-[var(--n-hover)]">{t.action.label}</button>
          )}
          <button type="button" aria-label="Fechar aviso" onClick={() => close(t.id)} className="rounded p-1 hover:bg-[var(--n-hover)]"><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}
