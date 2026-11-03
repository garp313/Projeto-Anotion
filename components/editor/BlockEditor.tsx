"use client";
import { useEffect, useMemo, useState } from "react";
import { filterSuggestionItems, insertOrUpdateBlock } from "@blocknote/core";
import { SuggestionMenuController, getDefaultReactSlashMenuItems, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { Minus, MessageSquareQuote } from "lucide-react";
import { useTheme } from "next-themes";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { schema } from "./blocks";
import { useAutoSave } from "@/lib/hooks/useAutoSave";

type Props = { pageId: string; initialContent: any[] | null; onStatus?: (s: "saved" | "saving" | "error") => void };

export function BlockEditor({ pageId, initialContent, onStatus }: Props) {
  const { save, status } = useAutoSave(pageId, 800);
  const { resolvedTheme } = useTheme(); // Extrai o tema de forma segura
  const [mounted, setMounted] = useState(false);

  // Garante que o editor só renderize no Client para evitar erros de hidratação
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  const editor = useCreateBlockNote({
    schema,
    initialContent: initialContent && initialContent.length ? (initialContent as any) : undefined,
    dictionary: undefined,
  });

  // ordem e rótulos do slash menu do Notion
  const getItems = useMemo(
    () => async (query: string) => {
      const defaults = getDefaultReactSlashMenuItems(editor);
      const custom = [
        {
          title: "Callout", subtext: "Destaque um texto com um emoji.", aliases: ["callout", "aviso", "destaque"], group: "Básico",
          icon: <MessageSquareQuote size={18} />,
          onItemClick: () => insertOrUpdateBlock(editor, { type: "callout" } as any),
        },
        {
          title: "Divisor", subtext: "Separe o conteúdo visualmente.", aliases: ["divider", "hr", "linha", "---"], group: "Básico",
          icon: <Minus size={18} />,
          onItemClick: () => insertOrUpdateBlock(editor, { type: "divider" } as any),
        },
      ];
      return filterSuggestionItems([...defaults, ...custom], query);
    },
    [editor]
  );

  if (!mounted) return null; // Previne qualquer flash branco ou mismatch no SSR

  return (
    <div className="notion-editor">
      <BlockNoteView
        editor={editor}
        slashMenu={false}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        onChange={() => save(editor.document)}
      >
        <SuggestionMenuController triggerCharacter="/" getItems={getItems} />
      </BlockNoteView>
    </div>
  );
}