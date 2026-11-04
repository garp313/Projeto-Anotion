"use client";

import { useMemo } from "react";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  insertOrUpdateBlock,
} from "@blocknote/core";
import {
  createReactBlockSpec,
  useCreateBlockNote,
  getDefaultReactSlashMenuItems,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { Table } from "lucide-react";
import { DatabaseView } from "@/components/database/DatabaseView";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

// 1. Bloco Personalizado para renderizar a Tabela de Banco de Dados
const DatabaseBlock = createReactBlockSpec(
  {
    type: "database",
    propSchema: {
      pageId: { default: "" },
    },
    content: "none",
  },
  {
    render: (props) => {
      return (
        <div className="my-4 w-full rounded-lg border border-[var(--n-border)] bg-[var(--n-bg)] p-4 shadow-sm">
          <DatabaseView pageId={props.block.props.pageId || "default"} />
        </div>
      );
    },
  }
);

// 2. Registra o bloco no Schema do editor
const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    database: DatabaseBlock,
  },
});

type BlockEditorProps = {
  initialContent?: string | object | null;
  onChange?: (content: string) => void;
  editable?: boolean;
  pageId?: string;
};

export function BlockEditorClient({
  initialContent,
  onChange,
  editable = true,
  pageId = "",
}: BlockEditorProps) {
  const parsedContent = useMemo(() => {
    if (!initialContent) return undefined;

    let result: any = undefined;

    if (typeof initialContent === "object") {
      result = initialContent;
    } else if (typeof initialContent === "string") {
      if (initialContent.trim() === "") return undefined;
      try {
        result = JSON.parse(initialContent);
      } catch (e) {
        console.warn("Erro ao ler JSON do editor:", e);
        return undefined;
      }
    }

    if (Array.isArray(result) && result.length > 0) {
      return result;
    }

    return undefined;
  }, [initialContent]);

  // 3. Inicializa o editor adicionando o item "Tabela de Banco de Dados" no menu '/'
  const editor = useCreateBlockNote({
    schema,
    initialContent: parsedContent,
    slashMenuItems: async (query) => [
      ...getDefaultReactSlashMenuItems(schema),
      {
        title: "Tabela de Banco de Dados",
        onItemClick: (editor) => {
          insertOrUpdateBlock(editor, {
            type: "database",
            props: { pageId },
          });
        },
        subtext: "Insere a tabela interativa com Status, Responsável e Filtros",
        aliases: ["database", "tabela", "bd", "banco"],
        group: "Avançado",
        icon: <Table size={18} />,
      },
    ],
  });

  return (
    <div className="w-full pl-2">
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme="dark"
        onChange={() => {
          if (onChange) {
            const contentJson = JSON.stringify(editor.document);
            onChange(contentJson);
          }
        }}
      />
    </div>
  );
}