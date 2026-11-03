"use client";
import { useState } from "react";
import {
  AlignLeft,
  Hash,
  CircleDot,
  ListFilter,
  SunMedium,
  Calendar,
  Users,
  Paperclip,
  CheckSquare,
  Link2,
  Phone,
  Mail,
  ArrowUpRight,
  Search,
  Sigma,
  PlaySquare,
  FileText,
} from "lucide-react";
import type { ColumnType } from "./types";

export type PropertyTypeItem = {
  type: ColumnType;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  description?: string;
};

export const ALL_PROPERTY_TYPES: PropertyTypeItem[] = [
  { type: "text", label: "Texto", icon: AlignLeft, description: "Texto simples, anotações e parágrafos" },
  { type: "number", label: "Número", icon: Hash, description: "Valores numéricos e moedas" },
  { type: "select", label: "Seleção", icon: CircleDot, description: "Selecione uma opção de uma lista" },
  { type: "multi_select", label: "Múltipla seleção", icon: ListFilter, description: "Selecione múltiplas tags" },
  { type: "status", label: "Status", icon: SunMedium, description: "Acompanhe o progresso de itens" },
  { type: "date", label: "Data", icon: Calendar, description: "Datas e lembretes" },
  { type: "person", label: "Pessoa", icon: Users, description: "Membros e responsáveis" },
  { type: "files", label: "Arquivos e mídia", icon: Paperclip, description: "Anexos e documentos" },
  { type: "checkbox", label: "Caixa de seleção", icon: CheckSquare, description: "Marque como concluído" },
  { type: "url", label: "URL", icon: Link2, description: "Links da web" },
  { type: "phone", label: "Telefone", icon: Phone, description: "Números para contato" },
  { type: "email", label: "E-mail", icon: Mail, description: "Endereços de e-mail" },
  { type: "relation", label: "Relação", icon: ArrowUpRight, description: "Conecte com outras páginas" },
  { type: "rollup", label: "Rollup", icon: Search, description: "Cálculos baseados em relações" },
  { type: "formula", label: "Fórmula", icon: Sigma, description: "Cálculos personalizados" },
  { type: "button", label: "Botão", icon: PlaySquare, description: "Dispare automações e ações" },
];

export function getPropertyIcon(type: ColumnType, size = 14, className = "text-[var(--n-text-muted)]") {
  if (type === "title") return <FileText size={size} className={className} />;
  const item = ALL_PROPERTY_TYPES.find((p) => p.type === type);
  if (!item) return <AlignLeft size={size} className={className} />;
  const IconComponent = item.icon;
  return <IconComponent size={size} className={className} />;
}

export function getPropertyLabel(type: ColumnType): string {
  if (type === "title") return "Nome";
  const item = ALL_PROPERTY_TYPES.find((p) => p.type === type);
  return item ? item.label : "Texto";
}

type Props = {
  selectedType?: ColumnType;
  onSelect: (type: ColumnType) => void;
  onClose?: () => void;
};

export function PropertyTypeMenu({ selectedType, onSelect, onClose }: Props) {
  const [search, setSearch] = useState("");

  const filtered = ALL_PROPERTY_TYPES.filter(
    (p) =>
      p.label.toLowerCase().includes(search.toLowerCase()) ||
      p.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-[280px] rounded-xl border border-[var(--n-border)] bg-[var(--n-bg)] p-1.5 shadow-2xl">
      {/* Search Bar - Exactly matching Notion's "Select type Q" */}
      <div className="relative mb-1 px-1 pt-0.5">
        <div className="flex items-center gap-1.5 rounded-md border border-[var(--n-border)] bg-[var(--n-bg-sidebar)]/50 px-2 py-1 text-xs">
          <Search size={13} className="text-[var(--n-text-faint)]" />
          <input
            type="text"
            placeholder="Pesquisar tipo de propriedade…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="w-full bg-transparent text-xs text-[var(--n-text)] outline-none placeholder:text-[var(--n-text-faint)]"
          />
        </div>
      </div>

      <div className="px-2 py-1 text-[11px] font-semibold text-[var(--n-text-faint)]">
        Tipos de propriedades
      </div>

      <div className="max-h-[300px] overflow-y-auto space-y-0.5 pr-0.5">
        {filtered.length === 0 ? (
          <div className="py-4 text-center text-xs text-[var(--n-text-faint)]">
            Nenhum tipo encontrado
          </div>
        ) : (
          filtered.map((item) => {
            const Icon = item.icon;
            const isSelected = selectedType === item.type;
            return (
              <button
                key={item.type}
                onClick={() => {
                  onSelect(item.type);
                  onClose?.();
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-[var(--n-hover)] ${
                  isSelected ? "bg-[var(--n-active)] font-medium text-[var(--n-text)]" : "text-[var(--n-text)]"
                }`}
              >
                <div className="grid h-5 w-5 shrink-0 place-items-center rounded bg-[var(--n-hover)] text-[var(--n-text-muted)]">
                  <Icon size={13} />
                </div>
                <div className="flex-1 truncate">
                  <div className="font-medium text-xs">{item.label}</div>
                  {item.description && (
                    <div className="text-[10px] text-[var(--n-text-faint)] truncate">
                      {item.description}
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
