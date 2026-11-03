"use client";
import { useState, useRef, useEffect } from "react";
import * as Popover from "@radix-ui/react-dropdown-menu";
import {
  Trash2,
  Copy,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Plus,
  X,
  Check,
} from "lucide-react";
import type { ColumnSchema, ColumnType, SelectOption } from "./types";
import { NOTION_COLORS } from "./types";
import { PropertyTypeMenu, getPropertyIcon, getPropertyLabel } from "./PropertyTypeMenu";

// Componente blindado contra sobrescritas do React Query
function DebouncedOptionInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (val: string) => void;
  className?: string;
}) {
  const [localValue, setLocalValue] = useState(value);
  const isFocused = useRef(false);

  // Só aceita a atualização externa se o utilizador NÃO estiver a escrever
  useEffect(() => {
    if (!isFocused.current) {
      setLocalValue(value);
    }
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [localValue, value, onChange]);

  return (
    <input
      type="text"
      value={localValue}
      onFocus={() => { isFocused.current = true; }}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => {
        isFocused.current = false;
        if (localValue !== value) onChange(localValue);
      }}
      className={className}
    />
  );
}

type Props = {
  column: ColumnSchema;
  isFirst: boolean;
  isLast: boolean;
  onRename: (newName: string) => void;
  onChangeType: (newType: ColumnType) => void;
  onOptionsChange?: (options: SelectOption[]) => void;
  onDuplicate?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
};

export function ColumnMenu({
  column,
  isFirst,
  isLast,
  onRename,
  onChangeType,
  onOptionsChange,
  onDuplicate,
  onMoveLeft,
  onMoveRight,
  onDelete,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [subView, setSubView] = useState<"main" | "type" | "options">("main");
  
  const [name, setName] = useState(column.name);
  const nameInputFocused = useRef(false);
  
  const [newOptionName, setNewOptionName] = useState("");
  const [activeColorOptionId, setActiveColorOptionId] = useState<string | null>(null);

  // Aplica a mesma proteção no input do nome principal da coluna
  useEffect(() => {
    if (!nameInputFocused.current) {
      setName(column.name);
    }
  }, [column.name]);

  const handleNameBlur = () => {
    nameInputFocused.current = false;
    const trimmed = name.trim();
    if (trimmed && trimmed !== column.name) {
      onRename(trimmed);
    } else {
      setName(column.name);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleAddOption = () => {
    if (!newOptionName.trim() || !onOptionsChange) return;
    const currentOptions = column.options ?? [];
    const colorIndex = currentOptions.length % NOTION_COLORS.length;
    const newOpt: SelectOption = {
      id: "opt_" + Math.random().toString(36).substring(2, 9),
      value: newOptionName.trim(),
      color: NOTION_COLORS[colorIndex].bgClass,
    };
    onOptionsChange([...currentOptions, newOpt]);
    setNewOptionName("");
  };

  const handleUpdateOption = (optId: string, patch: Partial<SelectOption>) => {
    if (!onOptionsChange) return;
    const currentOptions = column.options ?? [];
    onOptionsChange(
      currentOptions.map((o) => (o.id === optId ? { ...o, ...patch } : o))
    );
  };

  const handleDeleteOption = (optId: string) => {
    if (!onOptionsChange) return;
    const currentOptions = column.options ?? [];
    onOptionsChange(currentOptions.filter((o) => o.id !== optId));
  };

  const isSelectLike =
    column.type === "select" ||
    column.type === "multi_select" ||
    column.type === "status";

  return (
    <Popover.Root open={open} onOpenChange={(val) => { setOpen(val); if (!val) setSubView("main"); }}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={5}
          className="z-50 w-[270px] rounded-xl border border-[var(--n-border)] bg-[var(--n-bg)] p-2 text-xs shadow-2xl animate-in fade-in zoom-in-95 duration-100"
        >
          {subView === "type" ? (
            <div>
              <button
                onClick={() => setSubView("main")}
                className="mb-1.5 flex items-center gap-1.5 rounded px-2 py-1 text-xs text-[var(--n-text-muted)] hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]"
              >
                <ArrowLeft size={13} /> Voltar
              </button>
              <PropertyTypeMenu
                selectedType={column.type}
                onSelect={(newType) => {
                  onChangeType(newType);
                  setSubView("main");
                }}
              />
            </div>
          ) : (
            <div className="space-y-2">
              {/* Column Name Input */}
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--n-text-faint)]">
                  Nome da propriedade
                </label>
                <input
                  type="text"
                  value={name}
                  onFocus={() => { nameInputFocused.current = true; }}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={handleNameBlur}
                  onKeyDown={handleNameKeyDown}
                  placeholder="Nome da coluna…"
                  className="w-full rounded-md border border-[var(--n-border)] bg-[var(--n-bg-sidebar)]/50 px-2 py-1.5 text-xs text-[var(--n-text)] outline-none transition-colors focus:border-[var(--n-accent)] focus:bg-[var(--n-bg)]"
                />
              </div>

              {/* Property Type Selector */}
              {column.id !== "title" && (
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--n-text-faint)]">
                    Tipo de propriedade
                  </label>
                  <button
                    onClick={() => setSubView("type")}
                    className="flex w-full items-center justify-between rounded-lg border border-[var(--n-border)] bg-[var(--n-bg-sidebar)]/30 px-2.5 py-1.5 text-xs text-[var(--n-text)] transition-colors hover:bg-[var(--n-hover)]"
                  >
                    <div className="flex items-center gap-2">
                      {getPropertyIcon(column.type, 14)}
                      <span className="font-medium">{getPropertyLabel(column.type)}</span>
                    </div>
                    <ChevronRight size={13} className="text-[var(--n-text-faint)]" />
                  </button>
                </div>
              )}

              {/* Select / Status Options Management */}
              {isSelectLike && (
                <div className="rounded-lg border border-[var(--n-border)] p-2 bg-[var(--n-bg-sidebar)]/30">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-[var(--n-text-muted)]">
                    <span>Opções disponíveis</span>
                    <span className="text-[10px] text-[var(--n-text-faint)]">
                      {column.options?.length ?? 0}
                    </span>
                  </div>

                  {/* List of options */}
                  <div className="max-h-[140px] space-y-1.5 overflow-y-auto pr-0.5">
                    {column.options?.map((opt) => (
                      <div key={opt.id} className="flex items-center gap-1.5">
                        {/* Color Button with mini palette popover */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveColorOptionId(
                                activeColorOptionId === opt.id ? null : opt.id
                              )
                            }
                            className={`h-4 w-4 shrink-0 rounded-full border border-black/10 dark:border-white/10 ${
                              NOTION_COLORS.find((c) => c.bgClass === opt.color)?.dotClass ?? "bg-gray-400"
                            }`}
                            title="Mudar cor"
                          />

                          {activeColorOptionId === opt.id && (
                            <div className="absolute left-0 top-5 z-50 flex w-36 flex-wrap gap-1 rounded-lg border border-[var(--n-border)] bg-[var(--n-bg)] p-1.5 shadow-xl">
                              {NOTION_COLORS.map((c) => (
                                <button
                                  key={c.name}
                                  type="button"
                                  onClick={() => {
                                    handleUpdateOption(opt.id, { color: c.bgClass });
                                    setActiveColorOptionId(null);
                                  }}
                                  className={`h-4 w-4 rounded-full ${c.dotClass} hover:scale-110 transition-transform`}
                                  title={c.name}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Editable Option Text - Debounced e Protegido */}
                        <DebouncedOptionInput
                          value={opt.value}
                          onChange={(newVal) => handleUpdateOption(opt.id, { value: newVal })}
                          className="flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-[var(--n-text)] outline-none hover:border-[var(--n-border)] focus:border-[var(--n-accent)] focus:bg-[var(--n-bg)]"
                        />

                        {/* Delete Option */}
                        <button
                          type="button"
                          onClick={() => handleDeleteOption(opt.id)}
                          className="grid h-5 w-5 place-items-center rounded text-[var(--n-text-faint)] hover:bg-red-500/10 hover:text-red-500"
                          title="Remover opção"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add Option Input */}
                  <div className="mt-2 flex items-center gap-1">
                    <input
                      type="text"
                      placeholder="Nova opção…"
                      value={newOptionName}
                      onChange={(e) => setNewOptionName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddOption()}
                      className="flex-1 rounded border border-[var(--n-border)] bg-[var(--n-bg)] px-2 py-1 text-[11px] text-[var(--n-text)] outline-none placeholder:text-[var(--n-text-faint)] focus:border-[var(--n-accent)]"
                    />
                    <button
                      type="button"
                      onClick={handleAddOption}
                      disabled={!newOptionName.trim()}
                      className="rounded bg-[var(--n-accent)] p-1 text-white hover:brightness-95 disabled:opacity-40"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              )}

              {/* Divider */}
              <div className="my-1 border-t border-[var(--n-border)]" />

              {/* Column Actions */}
              <div className="space-y-0.5 pt-0.5">
                {onDuplicate && column.id !== "title" && (
                  <button
                    onClick={() => {
                      onDuplicate();
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[var(--n-text)] hover:bg-[var(--n-hover)]"
                  >
                    <Copy size={13} className="text-[var(--n-text-muted)]" />
                    <span>Duplicar propriedade</span>
                  </button>
                )}

                {onMoveLeft && !isFirst && (
                  <button
                    onClick={() => {
                      onMoveLeft();
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[var(--n-text)] hover:bg-[var(--n-hover)]"
                  >
                    <ArrowLeft size={13} className="text-[var(--n-text-muted)]" />
                    <span>Mover para a esquerda</span>
                  </button>
                )}

                {onMoveRight && !isLast && (
                  <button
                    onClick={() => {
                      onMoveRight();
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[var(--n-text)] hover:bg-[var(--n-hover)]"
                  >
                    <ArrowRight size={13} className="text-[var(--n-text-muted)]" />
                    <span>Mover para a direita</span>
                  </button>
                )}

                {onDelete && column.id !== "title" && (
                  <button
                    onClick={() => {
                      onDelete();
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 size={13} />
                    <span>Excluir propriedade</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}