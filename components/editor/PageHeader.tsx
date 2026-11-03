"use client";
import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-dropdown-menu";
import { ImagePlus, Smile, Table, FileText } from "lucide-react";
import { usePageTree, type PageRow } from "@/lib/hooks/usePageTree";
import { CoverPicker } from "./CoverPicker";

const EMOJIS = ["📄","📝","📚","💡","🚀","🎯","✅","📅","🏠","💼","🧠","🔥","⭐","🎨","🛠️","📊","🌱","🎵","🍕","✈️","❤️","🔒","📌","🧪"];

export function PageHeader({ page }: { page: PageRow }) {
  const { updatePage } = usePageTree();
  const [title, setTitle] = useState(page.title);
  const ta = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => setTitle(page.title), [page.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = ta.current; if (el) { el.style.height = "0"; el.style.height = el.scrollHeight + "px"; } }, [title]);

  const patch = (p: Partial<PageRow>) => updatePage.mutate({ id: page.id, patch: p });
  const onTitle = (v: string) => {
    setTitle(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => patch({ title: v }), 300);
  };

  const ghost = "inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]";
  const menu = "z-50 rounded-md border border-[var(--n-border)] bg-[var(--n-bg)] shadow-lg";

  return (
    <header className="group/header">
      {page.cover ? (
        <div className="group/cover relative h-[30vh] min-h-[160px] w-full" style={{ background: page.cover }}>
          <Popover.Root>
            <Popover.Trigger className="absolute bottom-2 right-4 rounded bg-[var(--n-bg)]/80 px-2 py-1 text-xs opacity-0 backdrop-blur group-hover/cover:opacity-100">
              Alterar capa
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="end" className={menu}>
                <CoverPicker onPick={(c) => patch({ cover: c })} onRemove={() => patch({ cover: null })} />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      ) : <div className="h-12" />}

      <div className="mx-auto w-full max-w-[900px] px-[max(24px,calc(50%-450px+96px))]">
        <div className={`relative ${page.cover ? "-mt-9" : ""}`}>
          {page.icon && (
            <Popover.Root>
              <Popover.Trigger aria-label="Trocar ícone" className="rounded p-1 text-[72px] leading-none hover:bg-[var(--n-hover)]">{page.icon}</Popover.Trigger>
              <Popover.Portal>
                <Popover.Content align="start" className={`${menu} w-[280px] p-2`}>
                  <div className="grid grid-cols-8 gap-1">
                    {EMOJIS.map((e) => <Popover.Item key={e} onSelect={() => patch({ icon: e })} className="grid h-8 w-8 cursor-pointer place-items-center rounded text-xl outline-none data-[highlighted]:bg-[var(--n-hover)]">{e}</Popover.Item>)}
                  </div>
                  <Popover.Item onSelect={() => patch({ icon: null })} className="mt-2 cursor-pointer rounded px-2 py-1 text-sm outline-none data-[highlighted]:bg-[var(--n-hover)]">Remover</Popover.Item>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          )}

          {/* só aparecem ao passar o mouse */}
          <div className="mb-1 mt-2 flex gap-1 opacity-0 transition-opacity group-hover/header:opacity-100 focus-within:opacity-100">
            {!page.icon && <button className={ghost} onClick={() => patch({ icon: EMOJIS[Math.floor(Math.random() * EMOJIS.length)] })}><Smile size={14} /> Adicionar ícone</button>}
            {!page.cover && (
              <Popover.Root>
                <Popover.Trigger className={ghost}><ImagePlus size={14} /> Adicionar capa</Popover.Trigger>
                <Popover.Portal><Popover.Content align="start" className={menu}><CoverPicker onPick={(c) => patch({ cover: c })} /></Popover.Content></Popover.Portal>
              </Popover.Root>
            )}
            <button
              className={ghost}
              onClick={() => patch({ is_database: !page.is_database })}
            >
              {page.is_database ? <FileText size={14} /> : <Table size={14} />}
              {page.is_database ? "Converter em documento" : "Converter em banco de dados"}
            </button>
          </div>

          <textarea
            ref={ta} rows={1} value={title} placeholder="Sem título" aria-label="Título da página"
            onChange={(e) => onTitle(e.target.value.replace(/\n/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.querySelector<HTMLElement>(".notion-editor [contenteditable=true]")?.focus(); } }}
            className="mb-2 block w-full resize-none overflow-hidden border-0 bg-transparent text-[40px] font-bold leading-[1.2] tracking-tight outline-none placeholder:text-[var(--n-text-faint)]"
          />
        </div>
      </div>
    </header>
  );
}
