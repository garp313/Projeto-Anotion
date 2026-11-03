"use client";
import { FileText, Plus, Trash2, Calendar, ExternalLink } from "lucide-react";
import type { ColumnSchema, DatabaseRow } from "./types";

type Props = {
  schema: ColumnSchema[];
  rows: DatabaseRow[];
  selectedRowId?: string | null;
  onSelectRow?: (rowId: string) => void;
  onAddRow: () => void;
  onDeleteRow: (rowId: string) => void;
};

export function ListView({
  schema,
  rows,
  selectedRowId,
  onSelectRow,
  onAddRow,
  onDeleteRow,
}: Props) {
  const selectCols = schema.filter((c) => c.type === "select" || c.type === "status");
  const dateCol = schema.find((c) => c.type === "date");

  return (
    <div className="w-full space-y-1 py-2">
      <div className="space-y-0.5">
        {rows.map((row) => {
          const isSelected = selectedRowId === row.id;

          return (
            <div
              key={row.id}
              onClick={() => onSelectRow?.(row.id)}
              className={`group flex h-9 cursor-pointer items-center justify-between rounded-lg px-2.5 text-sm transition-all ${
                isSelected
                  ? "bg-[var(--n-accent)]/10 ring-1 ring-[var(--n-accent)]/40"
                  : "hover:bg-[var(--n-hover)]"
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center text-sm">
                  {row.icon ?? <FileText size={15} className="text-[var(--n-text-muted)]" />}
                </span>
                <span className="truncate font-medium text-[var(--n-text)] group-hover:text-[var(--n-accent)]">
                  {row.title || "Sem título"}
                </span>
              </div>

              {/* Properties summary on right */}
              <div className="flex shrink-0 items-center gap-2 text-xs">
                {selectCols.map((col) => {
                  const val = row.row_properties?.[col.id];
                  if (!val) return null;
                  const opt = col.options?.find((o) => o.id === val);
                  return opt ? (
                    <span
                      key={col.id}
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${opt.color}`}
                    >
                      {opt.value}
                    </span>
                  ) : null;
                })}

                {dateCol && row.row_properties?.[dateCol.id] && (
                  <span className="flex items-center gap-1 text-[11px] text-[var(--n-text-faint)]">
                    <Calendar size={11} /> {row.row_properties[dateCol.id]}
                  </span>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRow?.(row.id);
                  }}
                  className="rounded p-1 text-[var(--n-text-faint)] opacity-0 hover:bg-[var(--n-hover)] hover:text-[var(--n-text)] group-hover:opacity-100"
                  title="Abrir página (Side Peek)"
                >
                  <ExternalLink size={13} />
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteRow(row.id);
                  }}
                  className="grid h-6 w-6 place-items-center rounded text-[var(--n-text-faint)] opacity-0 hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                  title="Excluir"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={onAddRow}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[var(--n-text-muted)] transition-colors hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]"
      >
        <Plus size={14} />
        <span>Novo item</span>
      </button>
    </div>
  );
}
