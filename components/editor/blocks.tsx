"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { createReactBlockSpec, createReactInlineContentSpec, useEditorChange } from "@blocknote/react";
import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";

const DatabaseView = dynamic(() => import("@/components/database/DatabaseView").then((m) => m.DatabaseView), { ssr: false });

/** Callout com emoji clicável (alterna entre alguns emojis ao clicar). */
const EMOJIS = ["💡", "⚠️", "✅", "📌", "❗", "🔥"];

export const Callout = createReactBlockSpec(
  {
    type: "callout",
    propSchema: { emoji: { default: "💡" } },
    content: "inline",
  },
  {
    render: ({ block, editor, contentRef }) => (
      <div className="my-1 flex w-full items-start gap-2 rounded-md bg-[var(--n-callout)] p-4">
        <button
          type="button"
          contentEditable={false}
          aria-label="Trocar emoji"
          className="select-none text-2xl leading-none"
          onClick={() => {
            const i = EMOJIS.indexOf(block.props.emoji);
            editor.updateBlock(block, { props: { emoji: EMOJIS[(i + 1) % EMOJIS.length] } });
          }}
        >
          {block.props.emoji}
        </button>
        <div className="min-w-0 flex-1" ref={contentRef} />
      </div>
    ),
  }
);

export const Divider = createReactBlockSpec(
  { type: "divider", propSchema: {}, content: "none" },
  { render: () => <hr className="my-3 w-full border-t border-[var(--n-border)]" /> }
);

/** Banco de dados inline: as linhas vivem numa página-filha, o bloco só a exibe. */
export const DatabaseBlock = createReactBlockSpec(
  { type: "database", propSchema: { databaseId: { default: "" } }, content: "none" },
  {
    render: ({ block }) => (
      <div contentEditable={false} className="my-2 w-full">
        {block.props.databaseId && <DatabaseView databaseId={block.props.databaseId} />}
      </div>
    ),
  }
);

const headingsOf = (blocks: any[]): { id: string; level: number; text: string }[] =>
  blocks.flatMap((b) => [
    ...(b.type === "heading" ? [{ id: b.id, level: b.props.level ?? 1, text: (b.content ?? []).map((c: any) => c.text ?? c.props?.label ?? "").join("") }] : []),
    ...headingsOf(b.children ?? []),
  ]);

function TocView({ editor }: { editor: any }) {
  const [items, setItems] = useState(() => headingsOf(editor.document));
  useEditorChange(() => setItems(headingsOf(editor.document)), editor);
  if (!items.length) return <p className="w-full py-1 text-sm text-[var(--n-text-faint)]">Adicione títulos para montar o sumário.</p>;
  return (
    <nav aria-label="Sumário" className="w-full py-1 text-sm">
      {items.map((h) => (
        <button key={h.id} type="button" style={{ paddingLeft: (h.level - 1) * 16 }}
          onClick={() => document.querySelector(`[data-id="${h.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="block w-full truncate rounded py-0.5 text-left text-[var(--n-text-muted)] underline decoration-[var(--n-text-faint)] hover:bg-[var(--n-hover)]">
          {h.text || "Sem título"}
        </button>
      ))}
    </nav>
  );
}

export const Toc = createReactBlockSpec(
  { type: "toc", propSchema: {}, content: "none" },
  { render: ({ editor }) => <div contentEditable={false} className="w-full"><TocView editor={editor} /></div> }
);

const safeUrl = (s: string) => {
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch { return null; }
};

function UrlPrompt({ label, onSubmit }: { label: string; onSubmit: (url: string) => void }) {
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  const send = () => { const u = safeUrl(text.trim()); if (u && text.trim()) onSubmit(u.href); else setBad(true); };
  return (
    <div className="flex w-full items-center gap-2 rounded-md bg-[var(--n-callout)] p-3">
      <input aria-label={label} aria-invalid={bad} value={text} placeholder="Cole o endereço (https://…)" onChange={(e) => { setText(e.target.value); setBad(false); }}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); send(); } }}
        className={`min-w-0 flex-1 rounded border bg-[var(--n-bg)] px-2 py-1 text-sm outline-none ${bad ? "border-red-500" : "border-[var(--n-border)]"}`} />
      <button type="button" onClick={send} className="rounded bg-[var(--n-accent)] px-2 py-1 text-xs font-medium text-white">{label}</button>
    </div>
  );
}

export const BookmarkBlock = createReactBlockSpec(
  { type: "bookmark", propSchema: { url: { default: "" } }, content: "none" },
  {
    render: ({ block, editor }) => {
      const u = block.props.url ? safeUrl(block.props.url) : null;
      return (
        <div contentEditable={false} className="my-1 w-full">
          {!u ? <UrlPrompt label="Salvar link" onSubmit={(url) => editor.updateBlock(block, { props: { url } })} /> : (
            <a href={u.href} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md border border-[var(--n-border)] p-3 hover:bg-[var(--n-hover)]">
              <ExternalLink size={15} className="shrink-0 text-[var(--n-text-faint)]" />
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{u.hostname}</span><span className="block truncate text-xs text-[var(--n-text-muted)]">{u.href}</span></span>
            </a>
          )}
        </div>
      );
    },
  }
);

const MIN_HEIGHT = 200, MAX_HEIGHT = 1400, MIN_WIDTH = 30;

/** Janela incorporada: largura em % acompanha a tela; a altura fica no valor escolhido. */
/** Apps com rolagem própria. Num vídeo, travar a página só atrapalharia. */
const SCROLLS_INSIDE = /(^|\.)(docs|sheets)\.google\.com$/;

/**
 * O navegador repassa à página a rolagem que o iframe não consome, e a página nem fica sabendo
 * que o mouse entrou num iframe de outro site. Por isso uma camada invisível percebe a chegada,
 * trava a página e sai da frente. Com o mouse lá dentro a página não recebe nada: qualquer
 * movimento que ela veja quer dizer que ele saiu.
 * Espera a página parar, senão rolar por ela prenderia a pessoa ao passar pela planilha.
 */
function useHoldPageScroll() {
  const [held, setHeld] = useState(false);
  const release = useRef<() => void>(() => {});
  useEffect(() => () => release.current(), []);

  const begin = (el: HTMLElement, now: boolean) => {
    const main = el.closest("main");
    if (!main) return;
    release.current();
    let last = now ? 0 : Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const moved = () => { last = Date.now(); };
    const left = (e: PointerEvent) => { if ((e.target as Element).tagName !== "IFRAME") release.current(); };
    const hold = () => {
      if (Date.now() - last < 150) { timer = setTimeout(hold, 50); return; }
      // A faixa da barra fica reservada: sem isso a janela mudaria de largura a cada passagem do mouse.
      main.style.scrollbarGutter = "stable";
      main.style.overflowY = "hidden";
      document.addEventListener("pointermove", left, true);
      setHeld(true);
    };
    release.current = () => {
      clearTimeout(timer);
      main.removeEventListener("scroll", moved);
      document.removeEventListener("pointermove", left, true);
      main.style.overflowY = "";
      main.style.scrollbarGutter = "";
      setHeld(false);
      release.current = () => {};
    };
    main.addEventListener("scroll", moved, { passive: true });
    if (now) hold(); else timer = setTimeout(hold, 150);
  };

  return {
    held,
    shield: {
      onPointerEnter: (e: React.PointerEvent<HTMLElement>) => begin(e.currentTarget, false),
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => begin(e.currentTarget, true),
      onPointerLeave: () => release.current(),
    },
  };
}

function EmbedFrame({ url, block, editor }: { url: URL; block: any; editor: any }) {
  const box = useRef<HTMLDivElement>(null);
  const { held, shield } = useHoldPageScroll();
  const [drag, setDrag] = useState<{ width: number; height: number } | null>(null);
  const width: number = drag?.width ?? block.props.width;
  const height: number = drag?.height ?? block.props.height;

  const start = (e: React.PointerEvent, axis: "x" | "y" | "xy") => {
    e.preventDefault();
    e.stopPropagation();
    // Sem capturar, o ponteiro some ao entrar no iframe e o arrasto para no meio.
    e.currentTarget.setPointerCapture(e.pointerId);
    const parent = box.current?.parentElement?.clientWidth ?? 1;
    const x0 = e.clientX, y0 = e.clientY, w0 = block.props.width, h0 = block.props.height;
    let next = { width: w0, height: h0 };
    setDrag(next);
    const move = (m: PointerEvent) => {
      next = {
        width: axis === "y" ? w0 : Math.round(Math.min(100, Math.max(MIN_WIDTH, w0 + ((m.clientX - x0) / parent) * 100))),
        height: axis === "x" ? h0 : Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h0 + m.clientY - y0))),
      };
      setDrag(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      editor.updateBlock(block, { props: next });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const handle = "absolute z-10 touch-none rounded bg-[var(--n-accent)] opacity-0 transition-opacity group-hover/embed:opacity-70 hover:!opacity-100";
  return (
    <div ref={box} data-testid="embed-box" style={{ width: `${width}%`, height }} className="group/embed relative max-w-full">
      {/* Sobre o iframe o navegador perde o ponteiro: durante o arrasto ele não recebe eventos. */}
      <iframe title={url.hostname} src={url.href} sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        className={`h-full w-full rounded-md border border-[var(--n-border)] ${drag ? "pointer-events-none" : ""}`} />
      {/* Só com mouse: no celular a camada engoliria o primeiro toque. */}
      {SCROLLS_INSIDE.test(url.hostname) && !held && !drag && (
        <div {...shield} data-testid="embed-shield" className="absolute inset-0 z-[5] hidden [@media(hover:hover)]:block" />
      )}
      <span role="separator" aria-orientation="vertical" aria-label="Ajustar largura" onPointerDown={(e) => start(e, "x")}
        className={`${handle} right-0 top-1/2 h-12 w-2 -translate-y-1/2 cursor-ew-resize`} />
      <span role="separator" aria-orientation="horizontal" aria-label="Ajustar altura" onPointerDown={(e) => start(e, "y")}
        className={`${handle} bottom-0 left-1/2 h-2 w-12 -translate-x-1/2 cursor-ns-resize`} />
      <span role="separator" aria-label="Ajustar tamanho" onPointerDown={(e) => start(e, "xy")}
        className={`${handle} bottom-0 right-0 h-3 w-3 cursor-nwse-resize`} />
    </div>
  );
}

export const EmbedBlock = createReactBlockSpec(
  { type: "embed", propSchema: { url: { default: "" }, width: { default: 100 }, height: { default: 384 } }, content: "none" },
  {
    render: ({ block, editor }) => {
      const u = block.props.url ? safeUrl(block.props.url) : null;
      return (
        <div contentEditable={false} className="my-1 w-full">
          {!u ? <UrlPrompt label="Incorporar" onSubmit={(url) => editor.updateBlock(block, { props: { url } })} />
            : <EmbedFrame url={u} block={block} editor={editor} />}
        </div>
      );
    },
  }
);

/** @menção de pessoa, página ou data. */
export const Mention = createReactInlineContentSpec(
  {
    type: "mention",
    propSchema: { kind: { default: "page" }, label: { default: "" }, target: { default: "" } },
    content: "none",
  },
  {
    render: ({ inlineContent: { props } }) =>
      props.kind === "page" ? (
        <Link href={`/workspace/${props.target}`} className="rounded px-0.5 font-medium underline decoration-[var(--n-text-faint)] hover:bg-[var(--n-hover)]">
          {props.label}
        </Link>
      ) : (
        <span className="rounded bg-[var(--n-hover)] px-1 text-[var(--n-accent)]">{props.kind === "person" ? "@" : ""}{props.label}</span>
      ),
  }
);

export const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, callout: Callout, divider: Divider, database: DatabaseBlock, toc: Toc, bookmark: BookmarkBlock, embed: EmbedBlock },
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: Mention },
});
