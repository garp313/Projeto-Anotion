"use client";

import { use } from "react";
import { useState } from "react";
import PageView from "@/components/editor/PageView";

export default function WorkspacePage({ params }: { params: Promise<{ pageId: string }> }) {
  const resolvedParams = use(params);
  
  // Estado local da página atual
  const [pageData, setPageData] = useState({
    id: resolvedParams.pageId,
    title: "Projetos",
    icon: "💼",
    coverUrl: null,
    content: null,
    properties: {},
  });

  const handleUpdate = (updates: any) => {
    setPageData((prev) => ({ ...prev, ...updates }));
    // Aqui podes adicionar a chamada de sincronização com a base de dados/Supabase
  };

  return <PageView page={pageData} onUpdatePage={handleUpdate} />;
}