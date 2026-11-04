"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { createReactBlockSpec, createReactInlineContentSpec, useEditorChange } from "@blocknote/react";
import { useState } from "react";
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

export const EmbedBlock = createReactBlockSpec(
  { type: "embed", propSchema: { url: { default: "" } }, content: "none" },
  {
    render: ({ block, editor }) => {
      const u = block.props.url ? safeUrl(block.props.url) : null;
      return (
        <div contentEditable={false} className="my-1 w-full">
          {!u ? <UrlPrompt label="Incorporar" onSubmit={(url) => editor.updateBlock(block, { props: { url } })} />
            : <iframe title={u.hostname} src={u.href} sandbox="allow-scripts allow-same-origin allow-popups allow-forms" className="h-96 w-full rounded-md border border-[var(--n-border)]" />}
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
