"use client";

import dynamic from "next/dynamic";

type BlockEditorProps = {
  initialContent?: string | object | null;
  onChange?: (content: string) => void;
  editable?: boolean;
  pageId?: string;
};

const BlockEditorClient = dynamic(
  () => import("./BlockEditorClient").then((m) => m.BlockEditorClient),
  {
    ssr: false,
    loading: () => (
      <div className="p-4 text-xs text-[var(--n-text-faint)]">
        A carregar editor...
      </div>
    ),
  }
);

export function BlockEditor(props: BlockEditorProps) {
  return <BlockEditorClient {...props} />;
}