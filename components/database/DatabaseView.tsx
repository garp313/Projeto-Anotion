"use client";

import { useState } from "react";
import { Plus, Table as TableIcon, LayoutGrid, List, Calendar } from "lucide-react";

export type ViewTab = {
  id: string;
  name: string;
  icon?: string;
  type: "table" | "board" | "list" | "timeline";
};

type DatabaseViewProps = {
  pageId: string;
  defaultView?: "table" | "board" | "list" | "timeline";
};

export function DatabaseView({ pageId, defaultView = "table" }: DatabaseViewProps) {
  // Lista de Abas estilo Notion
  const [tabs, setTabs] = useState<ViewTab[]>([
    { id: "1", name: "Todas", icon: "⭐", type: "table" },
    { id: "2", name: "Área", icon: "Aa", type: "board" },
    { id: "3", name: "Dados", icon: "🎲", type: "table" },
    { id: "4", name: "Projetos", icon: "⚙️", type: "table" },
    { id: "5", name: "B2B", icon: "🏭", type: "table" },
    { id: "6", name: "Processos/Qualidade", icon: "✅", type: "list" },
  ]);

  const [activeTabId, setActiveTabId] = useState("1");

  // Função para criar uma nova aba
  const handleAddTab = () => {
    const newTabName = prompt("Nome da nova aba/visualização:", "Nova Visualização");
    if (!newTabName) return;

    const newTab: ViewTab = {
      id: crypto.randomUUID(),
      name: newTabName,
      icon: "📄",
      type: "table",
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  return (
    <div className="w-full flex flex-col space-y-3 my-4">
      {/* BARRA DE ABAS ESTILO NOTION */}
      <div className="flex items-center gap-1 border-b border-[var(--n-border)] pb-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-[var(--n-hover)] text-[var(--n-text)] border-b-2 border-[var(--n-accent)] font-semibold"
                  : "text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]/50 hover:text-[var(--n-text)]"
              }`}
            >
              <span>{tab.icon || "📄"}</span>
              <span>{tab.name}</span>
            </button>
          );
        })}

        {/* BOTÃO + PARA CRIAR NOVA ABA */}
        <button
          onClick={handleAddTab}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-[var(--n-text-faint)] hover:text-[var(--n-text)] hover:bg-[var(--n-hover)] rounded-md transition-colors"
          title="Adicionar uma visualização/aba"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* CONTEÚDO DA VISUALIZAÇÃO SELECIONADA */}
      <div className="pt-2">
        {activeTab.type === "table" && (
          <div className="border border-[var(--n-border)] rounded-md p-4 text-xs text-[var(--n-text-muted)]">
            <div className="font-semibold text-[var(--n-text)] mb-2">
              📊 Tabela de Dados: {activeTab.name}
            </div>
            <p>Sua tabela com colunas de Status, Responsável, Data e Prioridade renderiza aqui.</p>
          </div>
        )}

        {activeTab.type === "board" && (
          <div className="border border-[var(--n-border)] rounded-md p-4 text-xs text-[var(--n-text-muted)]">
            <div className="font-semibold text-[var(--n-text)] mb-2">
              📋 Quadro (Kanban) agrupado por {activeTab.name}
            </div>
            <p>Seus cartões de status (Não iniciado, Em andamento, Concluído).</p>
          </div>
        )}

        {activeTab.type === "list" && (
          <div className="border border-[var(--n-border)] rounded-md p-4 text-xs text-[var(--n-text-muted)]">
            <div className="font-semibold text-[var(--n-text)] mb-2">
              📝 Lista Compacta: {activeTab.name}
            </div>
            <p>Lista simplificada de tarefas e checklists.</p>
          </div>
        )}
      </div>
    </div>
  );
}