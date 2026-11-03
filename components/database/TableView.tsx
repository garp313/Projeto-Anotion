"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import * as Popover from "@radix-ui/react-dropdown-menu";
import type { ColumnSchema, ColumnType, DatabaseRow, SelectOption } from "./types";
import { ColumnMenu } from "./ColumnMenu";
import { PropertyTypeMenu, getPropertyIcon } from "./PropertyTypeMenu";
import { CellEditor } from "./CellEditor";

type Props = {
  schema: ColumnSchema[];
  rows: DatabaseRow[];
  selectedRowId?: string | null;
  onSelectRow?: (rowId: string) => void;
  onCloseSidePeek?: () => void;
  onUpdateCell: (rowId: string, columnId: string, value: any) => void;
  onAddRow: () => void;
  onDeleteRow: (rowId: string) => void;
  onAddColumn: (name: string, type: ColumnType) => void;
  onUpdateColumnSchema: (newSchema: ColumnSchema[]) => void;
};

export function TableView({
  schema,
  rows,
  selectedRowId,
  onSelectRow,
  onCloseSidePeek,
  onUpdateCell,
  onAddRow,
  onDeleteRow,
  onAddColumn,
  onUpdateColumnSchema,
}: Props) {
  const [newColMenuOpen, setNewColMenuOpen] = useState(false);
  const [newColName, setNewColName] = useState("");

  const handleCreateColumn = (type: ColumnType) => {
    const finalName = newColName.trim() || `Coluna ${schema.length + 1}`;
    onAddColumn(finalName, type);
    setNewColName("");
    setNewColMenuOpen(false);
  };

  const handleMoveColumn = (fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= schema.length || toIndex >= schema.length) return;
    const newSchema = [...schema];
    const [moved] = newSchema.splice(fromIndex, 1);
    newSchema.splice(toIndex, 0, moved);
    onUpdateColumnSchema(newSchema);
  };

  const handleDuplicateColumn = (colIndex: number) => {
    const target = schema[colIndex];
    const newCol: ColumnSchema = {
      ...target,
      id: `${target.type}_${Date.now().toString(36)}`,
      name: `${target.name} (cópia)`,
    };
    const newSchema = [...schema];
    newSchema.splice(colIndex + 1, 0, newCol);
    onUpdateColumnSchema(newSchema);
  };

  return (
    <div className="w-full overflow-x-auto border-y border-[var(--n-border)]">
      <table className="w-full min-w-[700px] border-collapse text-left text-sm">
        {/* Table Header */}
        <thead>
          <tr className="border-b border-[var(--n-border)] bg-[var(--n-bg)] text-[var(--n-text-muted)]">
            <th className="w-10 px-2 py-2 text-center text-xs font-normal text-[var(--n-text-faint)]">
              #
            </th>

            {schema.map((col, index) => (
              <th
                key={col.id}
                className="group relative border-r border-[var(--n-border)] px-2 py-1.5 font-medium hover:bg-[var(--n-hover)]/60"
              >
                <ColumnMenu
                  column={col}
                  isFirst={index <= 1}
                  isLast={index === schema.length - 1}
                  onRename={(newName) => {
                    onUpdateColumnSchema(
                      schema.map((c) => (c.id === col.id ? { ...c, name: newName } : c))
                    );
                  }}
                  onChangeType={(newType) => {
                    onUpdateColumnSchema(
                      schema.map((c) => (c.id === col.id ? { ...c, type: newType } : c))
                    );
                  }}
                  onOptionsChange={(newOptions) => {
                    onUpdateColumnSchema(
                      schema.map((c) => (c.id === col.id ? { ...c, options: newOptions } : c))
                    );
                  }}
                  onDuplicate={() => handleDuplicateColumn(index)}
                  onMoveLeft={() => handleMoveColumn(index, index - 1)}
                  onMoveRight={() => handleMoveColumn(index, index + 1)}
                  onDelete={() => {
                    onUpdateColumnSchema(schema.filter((c) => c.id !== col.id));
                  }}
                >
                  <button className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs text-[var(--n-text-muted)] transition-colors hover:text-[var(--n-text)]">
                    <span className="shrink-0">{getPropertyIcon(col.type, 13)}</span>
                    <span className="truncate font-semibold">{col.name}</span>
                  </button>
                </ColumnMenu>
              </th>
            ))}

            {/* + Add Column (Matches Notion's + Column popover from Images 1 & 2) */}
            <th className="w-28 px-2 py-1.5">
              <Popover.Root open={newColMenuOpen} onOpenChange={setNewColMenuOpen}>
                <Popover.Trigger className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-normal text-[var(--n-text-faint)] transition-colors hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]">
                  <Plus size={13} />
                  <span>Coluna</span>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    align="start"
                    sideOffset={5}
                    className="z-50 w-[280px] rounded-xl border border-[var(--n-border)] bg-[var(--n-bg)] p-2 text-xs shadow-2xl"
                  >
                    <div className="mb-2">
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--n-text-faint)]">
                        Nome da coluna
                      </label>
                      <input
                        type="text"
                        placeholder="Nome da coluna…"
                        value={newColName}
                        onChange={(e) => setNewColName(e.target.value)}
                        className="w-full rounded-md border border-[var(--n-border)] bg-[var(--n-bg-sidebar)]/50 px-2 py-1.5 text-xs text-[var(--n-text)] outline-none focus:border-[var(--n-accent)] focus:bg-[var(--n-bg)]"
                      />
                    </div>
                    <PropertyTypeMenu onSelect={handleCreateColumn} />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </th>
          </tr>
        </thead>

        {/* Table Body */}
        <tbody>
          {rows.map((row, index) => {
            const isSelected = selectedRowId === row.id;

            return (
              <tr
                key={row.id}
                className={`group border-b border-[var(--n-border)] transition-colors ${
                  isSelected
                    ? "bg-[var(--n-accent)]/10 ring-1 ring-inset ring-[var(--n-accent)]/40"
                    : "hover:bg-[var(--n-hover)]/40"
                }`}
              >
                {/* Row Index / Actions */}
                <td className="w-10 px-2 py-1 text-center text-xs text-[var(--n-text-faint)]">
                  <span className="group-hover:hidden">{index + 1}</span>
                  <button
                    onClick={() => onDeleteRow(row.id)}
                    className="hidden rounded p-0.5 text-red-500 hover:bg-red-500/10 group-hover:inline-block"
                    title="Excluir linha"
                  >
                    <Trash2 size={12} />
                  </button>
                </td>

                {/* Columns */}
                {schema.map((col) => {
                  const val = col.id === "title" ? row.title : row.row_properties?.[col.id];

                  return (
                    <td
                      key={col.id}
                      className="border-r border-[var(--n-border)] px-3 py-1.5"
                    >
                      <CellEditor
                        column={col}
                        row={row}
                        value={val}
                        onChange={(newVal) => onUpdateCell(row.id, col.id, newVal)}
                        onOpenRow={() => {
                          if (isSelected) {
                            onCloseSidePeek?.();
                          } else {
                            onSelectRow?.(row.id);
                          }
                        }}
                        isSidePeekOpen={isSelected}
                      />
                    </td>
                  );
                })}

                <td className="w-28 px-3 py-1.5" />
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* + Nova linha button */}
      <div className="border-t border-[var(--n-border)] p-1.5">
        <button
          onClick={onAddRow}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-[var(--n-text-muted)] transition-colors hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]"
        >
          <Plus size={14} />
          <span>Nova linha</span>
        </button>
      </div>
    </div>
  );
}
