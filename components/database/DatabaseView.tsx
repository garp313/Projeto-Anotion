"use client";
import { useState, useEffect } from "react";
import { Table, Kanban, List, Plus } from "lucide-react";
import { useDatabase } from "./useDatabase";
import { TableView } from "./TableView";
import { BoardView } from "./BoardView";
import { ListView } from "./ListView";
import { SidePeek } from "./SidePeek";
import type { ColumnSchema, ColumnType, ViewType, PeekMode, DatabaseRow } from "./types";
import { DEFAULT_SCHEMA, NOTION_COLORS } from "./types";

type Props = {
  databaseId: string;
  initialSchema?: ColumnSchema[];
  initialView?: ViewType;
};

export function DatabaseView({
  databaseId,
  initialSchema = DEFAULT_SCHEMA,
  initialView = "table",
}: Props) {
  const [activeView, setActiveView] = useState<ViewType>(initialView);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [peekMode, setPeekMode] = useState<PeekMode>("side");

  const schema = initialSchema && initialSchema.length > 0 ? initialSchema : DEFAULT_SCHEMA;

  const {
    rows,
    isLoading,
    addRow,
    updateCell,
    updateRowMeta,
    deleteRow,
    updateSchema,
  } = useDatabase(databaseId, schema);

  // Close peek on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedRowId) {
        setSelectedRowId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedRowId]);

  const handleAddColumn = (name: string, type: ColumnType) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_" + Math.random().toString(36).substring(2, 6);
    let options = undefined;
    if (type === "select" || type === "multi_select") {
      options = [
        { id: "opt_1", value: "Opção 1", color: NOTION_COLORS[0].bgClass },
        { id: "opt_2", value: "Opção 2", color: NOTION_COLORS[5].bgClass },
      ];
    } else if (type === "status") {
      options = [
        { id: "not_started", value: "Não iniciado", color: NOTION_COLORS[0].bgClass },
        { id: "in_progress", value: "Em andamento", color: NOTION_COLORS[5].bgClass },
        { id: "done", value: "Concluído", color: NOTION_COLORS[4].bgClass },
      ];
    }
    const newCol: ColumnSchema = { id, name, type, options };
    updateSchema.mutate([...schema, newCol]);
  };

  const handleUpdateColumnSchema = (newSchema: ColumnSchema[]) => {
    updateSchema.mutate(newSchema);
  };

  const handleCreateAndOpenRow = async (initialValues: Partial<DatabaseRow> = {}) => {
    try {
      const newRow = await addRow.mutateAsync(initialValues);
      if (newRow?.id) {
        setSelectedRowId(newRow.id);
      }
    } catch (e) {
      console.error("Erro ao criar nova linha:", e);
    }
  };

  const selectedRow = rows.find((r) => r.id === selectedRowId);

  const tabClass = (view: ViewType) =>
    `flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
      activeView === view
        ? "border-[var(--n-text)] text-[var(--n-text)]"
        : "border-transparent text-[var(--n-text-muted)] hover:text-[var(--n-text)]"
    }`;

  const isSplitSidePeek = peekMode === "side" && Boolean(selectedRow);

  return (
    <div className="w-full">
      {/* View Switcher Tabs */}
      <div className="mb-3 flex items-center justify-between border-b border-[var(--n-border)]">
        <div className="flex items-center gap-1">
          <button onClick={() => setActiveView("table")} className={tabClass("table")}>
            <Table size={14} /> Tabela
          </button>
          <button onClick={() => setActiveView("board")} className={tabClass("board")}>
            <Kanban size={14} /> Quadro
          </button>
          <button onClick={() => setActiveView("list")} className={tabClass("list")}>
            <List size={14} /> Lista
          </button>
        </div>

        <div className="flex items-center gap-2 pr-1 text-xs text-[var(--n-text-faint)]">
          <span>{rows.length} registros</span>
          <button
            onClick={() => handleCreateAndOpenRow({ title: "" })}
            className="flex items-center gap-1 rounded-md bg-[var(--n-accent)] px-2.5 py-1 font-medium text-white shadow-xs transition-opacity hover:opacity-90"
          >
            <Plus size={13} /> Novo
          </button>
        </div>
      </div>

      {/* Main Container: Split view if Side Peek is active */}
      <div className={isSplitSidePeek ? "flex w-full items-start gap-4" : "w-full"}>
        {/* Left Pane: Database Views */}
        <div className={isSplitSidePeek ? "min-w-0 flex-1 overflow-x-auto" : "w-full"}>
          {isLoading ? (
            <div className="py-12 text-center text-xs text-[var(--n-text-faint)]">
              Carregando banco de dados…
            </div>
          ) : activeView === "table" ? (
            <TableView
              schema={schema}
              rows={rows}
              selectedRowId={selectedRowId}
              onSelectRow={(id) => setSelectedRowId(id)}
              onCloseSidePeek={() => setSelectedRowId(null)}
              onUpdateCell={(rowId, colId, val) =>
                updateCell.mutate({ rowId, columnId: colId, value: val })
              }
              onAddRow={() => handleCreateAndOpenRow({ title: "" })}
              onDeleteRow={(id) => {
                if (selectedRowId === id) setSelectedRowId(null);
                deleteRow.mutate(id);
              }}
              onAddColumn={handleAddColumn}
              onUpdateColumnSchema={handleUpdateColumnSchema}
            />
          ) : activeView === "board" ? (
            <BoardView
              schema={schema}
              rows={rows}
              selectedRowId={selectedRowId}
              onSelectRow={(id) => setSelectedRowId(id)}
              onUpdateCell={(rowId, colId, val) =>
                updateCell.mutate({ rowId, columnId: colId, value: val })
              }
              onAddRowWithValues={(vals) => handleCreateAndOpenRow(vals)}
            />
          ) : (
            <ListView
              schema={schema}
              rows={rows}
              selectedRowId={selectedRowId}
              onSelectRow={(id) => setSelectedRowId(id)}
              onAddRow={() => handleCreateAndOpenRow({ title: "" })}
              onDeleteRow={(id) => {
                if (selectedRowId === id) setSelectedRowId(null);
                deleteRow.mutate(id);
              }}
            />
          )}
        </div>

        {/* Right Pane: Side Peek (When mode === "side") */}
        {isSplitSidePeek && selectedRow && (
          <div className="sticky top-14 h-[calc(100vh-5rem)] w-[540px] shrink-0 overflow-hidden rounded-xl border border-[var(--n-border)] shadow-xl">
            <SidePeek
              row={selectedRow}
              schema={schema}
              mode={peekMode}
              onModeChange={setPeekMode}
              onClose={() => setSelectedRowId(null)}
              onUpdateCell={(rowId, colId, val) =>
                updateCell.mutate({ rowId, columnId: colId, value: val })
              }
              onUpdateRowMeta={(rowId, patch) =>
                updateRowMeta.mutate({ rowId, patch })
              }
              onDeleteRow={(id) => {
                deleteRow.mutate(id);
                setSelectedRowId(null);
              }}
              onAddColumn={handleAddColumn}
              onUpdateColumnSchema={handleUpdateColumnSchema}
            />
          </div>
        )}
      </div>

      {/* Floating Center Modal (When mode === "center") */}
      {peekMode === "center" && selectedRow && (
        <SidePeek
          row={selectedRow}
          schema={schema}
          mode={peekMode}
          onModeChange={setPeekMode}
          onClose={() => setSelectedRowId(null)}
          onUpdateCell={(rowId, colId, val) =>
            updateCell.mutate({ rowId, columnId: colId, value: val })
          }
          onUpdateRowMeta={(rowId, patch) =>
            updateRowMeta.mutate({ rowId, patch })
          }
          onDeleteRow={(id) => {
            deleteRow.mutate(id);
            setSelectedRowId(null);
          }}
          onAddColumn={handleAddColumn}
          onUpdateColumnSchema={handleUpdateColumnSchema}
        />
      )}
    </div>
  );
}
