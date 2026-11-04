"use client";

import { use, useState, useEffect } from "react";
import { PageHeader } from "@/components/editor/PageHeader";
import { DatabaseView } from "@/components/database/DatabaseView";

// Estado inicial simulado para manter as suas 3 páginas a funcionar
const MOCK_PAGES_DATA: Record<string, any> = {
  "1": { id: "1", title: "Projetos", icon: "💼", coverUrl: null },
  "2": { id: "2", title: "Planejamento Logístico", icon: "🦺", coverUrl: null },
  "3": { id: "3", title: "Atividades", icon: "🔖", coverUrl: null },
};

export default function WorkspacePage({ params }: { params: Promise<{ pageId: string }> }) {
  const resolvedParams = use(params);
  const pageId = resolvedParams.pageId;

  const [pageData, setPageData] = useState(() => {
    return MOCK_PAGES_DATA[pageId] || {
      id: pageId,
      title: "Nova Página",
      icon: "📄",
      coverUrl: null,
    };
  });

  // Atualiza os dados sempre que trocar de aba na Sidebar
  useEffect(() => {
    if (MOCK_PAGES_DATA[pageId]) {
      setPageData(MOCK_PAGES_DATA[pageId]);
    } else {
      setPageData({
        id: pageId,
        title: "Nova Página",
        icon: "📄",
        coverUrl: null,
      });
    }
  }, [pageId]);

  const handleUpdate = (updates: any) => {
    setPageData((prev: any) => {
      const updated = { ...prev, ...updates };
      MOCK_PAGES_DATA[pageId] = updated; 
      return updated;
    });
  };

  return (
    <div className="flex flex-col min-h-full w-full pb-32">
      {/* 1. Cabeçalho Simples e Funcional */}
      <PageHeader
        title={pageData.title}
        icon={pageData.icon}
        coverUrl={pageData.coverUrl}
        onUpdateTitle={(title) => handleUpdate({ title })}
        onUpdateIcon={(icon) => handleUpdate({ icon })}
        onUpdateCover={(coverUrl) => handleUpdate({ coverUrl })}
      />

      {/* 2. Tabela de Banco de Dados Central (O Coração da Ferramenta) */}
      <div className="mx-auto w-full max-w-6xl px-12 pt-6">
        <DatabaseView pageId={pageId} />
      </div>
    </div>
  );
}