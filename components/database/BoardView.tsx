"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, ExternalLink, Calendar } from "lucide-react";
import type { ColumnSchema, DatabaseRow } from "./types";

type Props = {
  schema: ColumnSchema[];
  rows: DatabaseRow[];
  selectedRowId?: string | null;
  onSelectRow?: (rowId: string) => void;
  onUpdateCell: (rowId: string, columnId: string, value: any) => void;
  onAddRowWithValues: (values: Partial<DatabaseRow>) => void;
};

export function BoardView({
  schema,
  rows,
  selectedRowId,
  onSelectRow,
  onUpdateCell,
  onAddRowWithValues,
}: Props) {
  // Encontrar a primeira coluna do tipo 'status' ou 'select' para agrupar
  const selectColumn =
    schema.find((c) => c.type === "status") ??
    schema.find((c) => c.type === "select" && c.id === "status") ??
    schema.find((c) => c.type === "select");

  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  if (!selectColumn || !selectColumn.options || selectColumn.options.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-[var(--n-text-faint)]">
        Para usar a visualização em Quadro (Kanban), adicione ao menos uma coluna do tipo &quot;Status&quot; ou &quot;Seleção&quot; na tabela.
      </div>
    );
  }

  const options = selectColumn.options;

  // Agrupar linhas por opção
  const getCardsForOption = (optId: string) => {
    return rows.filter((r) => {
      const val = r.row_properties?.[selectColumn.id];
      return val === optId;
    });
  };

  const handleDragStart = (e: React.DragEvent, rowId: string) => {
    e.dataTransfer.setData("text/plain", rowId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    setDragOverColId(colId);
  };

  const handleDrop = (e: React.DragEvent, targetOptId: string) => {
    e.preventDefault();
    setDragOverColId(null);
    const rowId = e.dataTransfer.getData("text/plain");
    if (!rowId) return;
    onUpdateCell(rowId, selectColumn.id, targetOptId);
  };

  return (
    <div className="flex w-full gap-4 overflow-x-auto pb-8 pt-2">
      {options.map((option) => {
        const cards = getCardsForOption(option.id);
        const isDragOver = dragOverColId === option.id;

        return (
          <div
            key={option.id}
            onDragOver={(e) => handleDragOver(e, option.id)}
            onDragLeave={() => setDragOverColId(null)}
            onDrop={(e) => handleDrop(e, option.id)}
            className={`flex w-[280px] shrink-0 flex-col rounded-xl bg-[var(--n-bg-sidebar)]/50 p-2.5 transition-colors ${
              isDragOver ? "ring-2 ring-[var(--n-accent)] bg-[var(--n-accent)]/10" : ""
            }`}
          >
            {/* Column Header */}
            <div className="mb-2.5 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${option.color}`}>
                  {option.value}
                </span>
                <span className="text-xs text-[var(--n-text-faint)]">{cards.length}</span>
              </div>
              <button
                onClick={() =>
                  onAddRowWithValues({
                    title: "Novo card",
                    row_properties: { [selectColumn.id]: option.id },
                  })
                }
                className="grid h-5 w-5 place-items-center rounded text-[var(--n-text-faint)] hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]"
                title="Novo card"
              >
                <Plus size={14} />
              </button>
            </div>

            {/* Cards List */}
            <div className="flex-1 space-y-2">
              {cards.map((card) => {
                const isSelected = selectedRowId === card.id;

                return (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, card.id)}
                    onClick={() => onSelectRow?.(card.id)}
                    className={`group cursor-pointer rounded-lg border bg-[var(--n-bg)] p-3 shadow-xs transition-all hover:shadow-md ${
                      isSelected
                        ? "border-[var(--n-accent)] ring-2 ring-[var(--n-accent)]/30"
                        : "border-[var(--n-border)] hover:border-[var(--n-accent)]/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-medium text-sm text-[var(--n-text)] group-hover:text-[var(--n-accent)]">
                        {card.title || "Sem título"}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRow?.(card.id);
                        }}
                        className="rounded p-1 text-[var(--n-text-faint)] opacity-0 group-hover:opacity-100 hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]"
                        title="Abrir página (Side Peek)"
                      >
                        <ExternalLink size={12} />
                      </button>
                    </div>

                    {/* Properties summary on card */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                      {Object.entries(card.row_properties || {}).map(([colId, val]) => {
                        if (!val || colId === selectColumn.id) return null;
                        const col = schema.find((c) => c.id === colId);
                        if (!col) return null;

                        if (col.type === "select" || col.type === "status") {
                          const opt = col.options?.find((o) => o.id === val);
                          return opt ? (
                            <span
                              key={colId}
                              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${opt.color}`}
                            >
                              {opt.value}
                            </span>
                          ) : null;
                        }

                        if (col.type === "date") {
                          return (
                            <span
                              key={colId}
                              className="flex items-center gap-1 text-[11px] text-[var(--n-text-faint)]"
                            >
                              <Calendar size={11} /> {val}
                            </span>
                          );
                        }

                        return null;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
