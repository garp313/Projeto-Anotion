"use client";

import { useState } from "react";
import { Plus, Trash2, Tag } from "lucide-react";

export type Property = {
  id: string;
  name: string;
  value: string;
};

type PagePropertiesProps = {
  properties?: Property[];
  onChange?: (properties: Property[]) => void;
};

export function PageProperties({
  properties = [],
  onChange,
}: PagePropertiesProps) {
  const [items, setItems] = useState<Property[]>(properties);

  // Adiciona uma nova propriedade personalizada
  const handleAddProperty = () => {
    const newItems = [
      ...items,
      { id: crypto.randomUUID(), name: "Nova Propriedade", value: "Vazio" },
    ];
    setItems(newItems);
    onChange?.(newItems);
  };

  // Atualiza o nome ou valor de uma propriedade existente
  const handleUpdate = (id: string, field: "name" | "value", newValue: string) => {
    const newItems = items.map((item) =>
      item.id === id ? { ...item, [field]: newValue } : item
    );
    setItems(newItems);
    onChange?.(newItems);
  };

  // Remove uma propriedade
  const handleRemove = (id: string) => {
    const newItems = items.filter((item) => item.id !== id);
    setItems(newItems);
    onChange?.(newItems);
  };

  return (
    <div className="w-full py-2 border-b border-[var(--n-border)] space-y-1.5">
      {/* Lista de Propriedades Dinâmicas */}
      {items.map((prop) => (
        <div
          key={prop.id}
          className="group flex items-center gap-4 text-xs py-1 px-1 rounded hover:bg-[var(--n-hover)]/50 transition-colors"
        >
          {/* Nome da Propriedade (editável) */}
          <div className="flex items-center gap-1.5 w-36 text-[var(--n-text-faint)]">
            <Tag size={12} />
            <input
              type="text"
              value={prop.name}
              onChange={(e) => handleUpdate(prop.id, "name", e.target.value)}
              className="w-full bg-transparent outline-none font-medium text-[var(--n-text-muted)] focus:text-[var(--n-text)]"
              placeholder="Nome da propriedade"
            />
          </div>

          {/* Valor da Propriedade (editável) */}
          <div className="flex-1">
            <input
              type="text"
              value={prop.value}
              onChange={(e) => handleUpdate(prop.id, "value", e.target.value)}
              className="w-full bg-transparent outline-none text-[var(--n-text)] font-semibold"
              placeholder="Adicionar valor..."
            />
          </div>

          {/* Botão de Excluir Propriedade */}
          <button
            onClick={() => handleRemove(prop.id)}
            className="opacity-0 group-hover:opacity-100 p-1 text-[var(--n-text-faint)] hover:text-red-400 transition-opacity"
            title="Remover propriedade"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      {/* Botão para Adicionar Nova Propriedade */}
      <button
        onClick={handleAddProperty}
        className="flex items-center gap-1.5 text-xs text-[var(--n-text-faint)] hover:text-[var(--n-text)] pt-1 px-1 transition-colors"
      >
        <Plus size={13} />
        <span>Adicionar uma propriedade</span>
      </button>
    </div>
  );
}