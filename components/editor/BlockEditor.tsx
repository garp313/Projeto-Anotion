"use client";
import { useEffect, useMemo } from "react";
import { filterSuggestionItems, insertOrUpdateBlock } from "@blocknote/core";
import { pt } from "@blocknote/core/locales";
import { SuggestionMenuController, getDefaultReactSlashMenuItems, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useQueryClient } from "@tanstack/react-query";
import { Bookmark, Calendar, Code2, FileText, Link2, ListChecks, ListTree, Minus, MessageSquareQuote, Table, User } from "lucide-react";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { schema } from "./blocks";
import { useAutoSave, type SaveStatus } from "@/lib/hooks/useAutoSave";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_SCHEMA } from "@/components/database/types";
import type { PageRow } from "@/lib/hooks/usePageTree";

/** A seção "Subtítulos" do pacote reúne títulos menores e expansíveis: o nome confundia. */
const slashMenu = Object.fromEntries(Object.entries(pt.slash_menu).map(([key, item]: [string, any]) =>
  [key, item.group === "Subtítulos" ? { ...item, group: "Títulos menores e expansíveis" } : item])) as typeof pt.slash_menu;

/** O menu usa o título como chave do React: duas páginas de mesmo nome colidiam. */
function uniqueTitles<T extends { title: string }>(items: T[]) {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const n = seen.get(item.title) ?? 0;
    seen.set(item.title, n + 1);
    return n ? { ...item, title: item.title + "\u200B".repeat(n) } : item;
  });
}

const DICTIONARY = {
  ...pt,
  slash_menu: { ...slashMenu, heading: { ...slashMenu.heading, title: "Título 1" } },
  placeholders: { ...pt.placeholders, default: "Digite algo ou “/” para ver os comandos", emptyDocument: "Digite algo ou “/” para ver os comandos" },
};

type Props = { pageId: string; initialContent: any[] | null; onStatus?: (s: SaveStatus) => void };

export function BlockEditor({ pageId, initialContent, onStatus }: Props) {
  const { save, status } = useAutoSave(pageId, 800);
  const qc = useQueryClient();

  useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  const editor = useCreateBlockNote({
    schema,
    initialContent: initialContent && initialContent.length ? (initialContent as any) : undefined,
    dictionary: DICTIONARY,
  });

  // ordem e rótulos do slash menu do Notion
  const getItems = useMemo(
    () => async (query: string) => {
      const defaults = getDefaultReactSlashMenuItems(editor);
      const custom = [
        {
          title: "Link para página", subtext: "Cite outra página do workspace.", aliases: ["pagina", "página", "link", "[["], group: "Blocos básicos",
          icon: <Link2 size={18} />,
          onItemClick: () => editor.openSuggestionMenu("@"),
        },
        {
          title: "Banco de dados", subtext: "Tabela, quadro, calendário e mais nesta página.", aliases: ["banco", "database", "tabela", "table", "db"], group: "Blocos básicos",
          icon: <Table size={18} />,
          onItemClick: async () => {
            const page = qc.getQueryData<{ workspace_id: string }>(["page", pageId]);
            if (!page) return;
            const { data, error } = await createClient().from("pages")
              .insert({ workspace_id: page.workspace_id, parent_id: pageId, title: "Banco de dados", is_database: true, database_schema: DEFAULT_SCHEMA, position: Date.now() })
              .select("id").single();
            if (error) return;
            insertOrUpdateBlock(editor, { type: "database", props: { databaseId: data.id } } as any);
            qc.invalidateQueries({ queryKey: ["pages"] });
          },
        },
        {
          title: "Callout", subtext: "Destaque um texto com um emoji.", aliases: ["callout", "aviso", "destaque"], group: "Blocos básicos",
          icon: <MessageSquareQuote size={18} />,
          onItemClick: () => insertOrUpdateBlock(editor, { type: "callout" } as any),
        },
        {
          title: "Divisor", subtext: "Separe o conteúdo visualmente.", aliases: ["divider", "hr", "linha", "---"], group: "Blocos básicos",
          icon: <Minus size={18} />,
          onItemClick: () => insertOrUpdateBlock(editor, { type: "divider" } as any),
        },
        {
          title: "Virar tarefa", subtext: "Cria a tarefa no banco Tarefas e deixa um link aqui.", aliases: ["tarefa", "acao", "ação", "task"], group: "Blocos básicos",
          icon: <ListChecks size={18} />,
          onItemClick: async () => {
            const block = editor.getTextCursorPosition().block;
            const title = (Array.isArray(block.content) ? block.content : []).map((c: any) => c.text ?? "").join("").trim();
            const database = (qc.getQueryData<PageRow[]>(["pages"]) ?? []).find((p) => p.is_database && p.title === "Tarefas");
            if (!title || !database) return;
            const { data, error } = await createClient().from("pages")
              .insert({ workspace_id: database.workspace_id, parent_id: database.id, title, position: Date.now(), row_properties: {} }).select("id").single();
            if (error) return;
            editor.updateBlock(block, { content: [{ type: "mention", props: { kind: "page", label: title, target: data.id } } as any] });
            qc.invalidateQueries({ queryKey: ["pages"] });
            qc.invalidateQueries({ queryKey: ["database_rows", database.id] });
          },
        },
        {
          title: "Sumário", subtext: "Lista os títulos desta página.", aliases: ["sumario", "toc", "indice", "índice"], group: "Blocos básicos",
          icon: <ListTree size={18} />,
          onItemClick: () => insertOrUpdateBlock(editor, { type: "toc" } as any),
        },
        {
          title: "Link salvo", subtext: "Cartão com o endereço de um site.", aliases: ["bookmark", "favorito", "url"], group: "Blocos básicos",
          icon: <Bookmark size={18} />,
          onItemClick: () => insertOrUpdateBlock(editor, { type: "bookmark" } as any),
        },
        {
          title: "Incorporar", subtext: "Mostre um site dentro da página.", aliases: ["embed", "iframe", "incorporar"], group: "Blocos básicos",
          icon: <Code2 size={18} />,
          onItemClick: () => insertOrUpdateBlock(editor, { type: "embed" } as any),
        },
      ];
      // O menu abre uma seção nova a cada troca de grupo: itens do mesmo grupo precisam ficar juntos.
      const at = defaults.map((i) => i.group).lastIndexOf("Blocos básicos") + 1;
      return filterSuggestionItems([...defaults.slice(0, at), ...custom, ...defaults.slice(at)], query);
    },
    [editor, pageId, qc]
  );

  const getMentions = useMemo(
    () => async (query: string) => {
      const mention = (kind: string, label: string, target: string) => () =>
        editor.insertInlineContent([{ type: "mention", props: { kind, label, target } } as any, " "]);
      const supabase = createClient();
      const [{ data }, { data: team }] = await Promise.all([supabase.auth.getSession(), supabase.rpc("collaborators")]);
      const user = data.session?.user;
      const name = user?.user_metadata?.full_name || user?.email;
      const found: { id: string; label: string }[] = [
        ...(name ? [{ id: user!.id, label: name as string }] : []),
        ...((team ?? []) as { id: string; name: string; email: string }[]).filter((m) => m.id !== user?.id).map((m) => ({ id: m.id, label: m.name || m.email })),
      ];
      const people = found.map((p) => ({ title: p.label, group: "Pessoas", icon: <User size={16} />, onItemClick: mention("person", p.label, p.id) }));
      const pages = (qc.getQueryData<PageRow[]>(["pages"]) ?? []).filter((p) => p.id !== pageId && p.title).map((p) => ({
        title: p.title, group: "Páginas", icon: p.icon ? <span>{p.icon}</span> : <FileText size={16} />, onItemClick: mention("page", p.title, p.id),
      }));
      const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d; };
      const dates = ([["Hoje", 0], ["Amanhã", 1], ["Próxima semana", 7]] as const).map(([title, offset]) => {
        const d = day(offset);
        return { title, subtext: d.toLocaleDateString("pt-BR"), group: "Datas", icon: <Calendar size={16} />, onItemClick: mention("date", d.toLocaleDateString("pt-BR"), d.toISOString().slice(0, 10)) };
      });
      return filterSuggestionItems(uniqueTitles([...people, ...dates, ...pages]), query).slice(0, 12);
    },
    [editor, pageId, qc]
  );

  return (
    <div className="notion-editor">
      <BlockNoteView
        editor={editor}
        slashMenu={false}
        theme={typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light"}
        onChange={() => save(editor.document)}
      >
        <SuggestionMenuController triggerCharacter="/" getItems={getItems} />
        <SuggestionMenuController triggerCharacter="@" getItems={getMentions} />
      </BlockNoteView>
    </div>
  );
}
