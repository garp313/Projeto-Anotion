"use client";

import { PageHeader } from "./PageHeader";
import { BlockEditor } from "./BlockEditor";

type PageViewProps = {
  pageId?: string;
  page?: {
    id: string;
    title: string;
    icon?: string | null;
    coverUrl?: string | null;
    content?: string | null;
    properties?: Record<string, any>;
  } | null;
  onUpdatePage?: (updates: any) => void;
};

export function PageView({ page, onUpdatePage }: PageViewProps) {
  const currentPage = page || {
    id: "default",
    title: "",
    icon: null,
    coverUrl: null,
    content: null,
    properties: {},
  };

  return (
    <div className="flex flex-col min-h-full w-full pb-32">
      <PageHeader
        title={currentPage.title || ""}
        icon={currentPage.icon}
        coverUrl={currentPage.coverUrl}
        onUpdateTitle={(title) => onUpdatePage?.({ title })}
        onUpdateIcon={(icon) => onUpdatePage?.({ icon })}
        onUpdateCover={(coverUrl) => onUpdatePage?.({ coverUrl })}
      />

      <div className="mx-auto w-full max-w-4xl px-12 pt-4 space-y-6">
        {currentPage.properties && Object.keys(currentPage.properties).length > 0 && (
          <div className="border-b border-[var(--n-border)] pb-4 space-y-2">
            {Object.entries(currentPage.properties).map(([key, value]) => (
              <div key={key} className="flex items-center text-xs gap-4">
                <span className="w-32 text-[var(--n-text-faint)] font-medium">{key}</span>
                <span className="text-[var(--n-text)] font-semibold bg-[var(--n-hover)] px-2 py-0.5 rounded">
                  {String(value || "Vazio")}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="border-b border-[var(--n-border)] pb-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--n-text-muted)] mb-2">
            💬 Comentários
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Adicionar um comentário..."
              className="flex-1 rounded-md border border-[var(--n-border)] bg-[var(--n-bg-sidebar)] px-3 py-1.5 text-xs text-[var(--n-text)] outline-none focus:border-[var(--n-accent)]"
            />
            <button className="rounded-md bg-[var(--n-accent)] px-3 py-1.5 text-xs font-medium text-white hover:brightness-95">
              Enviar
            </button>
          </div>
        </div>

        <div className="pt-2">
          <BlockEditor
            initialContent={currentPage.content}
            onChange={(content) => onUpdatePage?.({ content })}
          />
        </div>
      </div>
    </div>
  );
}

// Suporte para export default e named export
export default PageView;