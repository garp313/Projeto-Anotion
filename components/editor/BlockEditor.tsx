"use client";
import { useEffect, useMemo } from "react";
import { filterSuggestionItems, insertOrUpdateBlock } from "@blocknote/core";
import { pt } from "@blocknote/core/locales";
import { SuggestionMenuController, getDefaultReactSlashMenuItems, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useQueryClient } from "@tanstack/react-query";
import { Minus, MessageSquareQuote, Table } from "lucide-react";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { schema } from "./blocks";
import { useAutoSave } from "@/lib/hooks/useAutoSave";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_SCHEMA } from "@/components/database/types";

const DICTIONARY = {
  ...pt,
  placeholders: { ...pt.placeholders, default: "Digite algo ou “/” para ver os comandos", emptyDocument: "Digite algo ou “/” para ver os comandos" },
};

type Props = { pageId: string; initialContent: any[] | null; onStatus?: (s: "saved" | "saving" | "error") => void };

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
      ];
      return filterSuggestionItems([...defaults, ...custom], query);
    },
    [editor, pageId, qc]
  );

  return (
    <div className="notion-editor">
      <BlockNoteView
        editor={editor}
        slashMenu={false}
        theme={typeof window !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"}
        onChange={() => save(editor.document)}
      >
        <SuggestionMenuController triggerCharacter="/" getItems={getItems} />
      </BlockNoteView>
    </div>
  );
}
