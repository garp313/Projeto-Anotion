"use client";
import { useState, useRef, useEffect } from "react";
import * as Popover from "@radix-ui/react-dropdown-menu";
import {
  Calendar,
  ExternalLink,
  Plus,
  Check,
  X,
  User,
  Paperclip,
  Link2,
  Mail,
  Phone,
} from "lucide-react";
import type { ColumnSchema, DatabaseRow, SelectOption } from "./types";
import { NOTION_COLORS } from "./types";

type Props = {
  column: ColumnSchema;
  row: DatabaseRow;
  value: any;
  onChange: (newValue: any) => void;
  onOpenRow?: () => void;
  isSidePeekOpen?: boolean;
};

export function CellEditor({
  column,
  row,
  value,
  onChange,
  onOpenRow,
  isSidePeekOpen,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [textVal, setTextVal] = useState(value ?? "");

  useEffect(() => {
    setTextVal(value ?? "");
  }, [value]);

  // Title Column (Nome do projeto / página)
  if (column.id === "title" || column.type === "title") {
    return (
      <div className="group/cell relative flex items-center justify-between gap-2">
        <input
          type="text"
          value={textVal}
          placeholder="Sem título"
          onChange={(e) => {
            setTextVal(e.target.value);
            onChange(e.target.value);
          }}
          className="w-full bg-transparent py-0.5 text-sm font-medium text-[var(--n-text)] outline-none placeholder:text-[var(--n-text-faint)] focus:text-[var(--n-text)]"
        />

        {onOpenRow && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenRow();
            }}
            className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold transition-all ${
              isSidePeekOpen
                ? "bg-[var(--n-accent)]/15 text-[var(--n-accent)] opacity-100 ring-1 ring-[var(--n-accent)]/30"
                : "border border-[var(--n-border)] bg-[var(--n-bg)] text-[var(--n-text-muted)] opacity-0 shadow-xs hover:bg-[var(--n-hover)] hover:text-[var(--n-text)] group-hover/cell:opacity-100"
            }`}
            title="Abrir como página (Side Peek)"
          >
            <span>{isSidePeekOpen ? "FECHAR" : "ABRIR"}</span>
            <ExternalLink size={11} />
          </button>
        )}
      </div>
    );
  }

  // Checkbox Column
  if (column.type === "checkbox") {
    return (
      <div className="flex items-center justify-center py-1">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 cursor-pointer rounded border-[var(--n-border)] accent-[var(--n-accent)] transition-transform hover:scale-110"
        />
      </div>
    );
  }

  // Single Select Column
  if (column.type === "select" || column.type === "status") {
    const options = column.options ?? [];
    const currentOption = options.find((o) => o.id === value || o.value === value);

    return (
      <Popover.Root>
        <Popover.Trigger className="inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-xs outline-none hover:bg-[var(--n-hover)]">
          {currentOption ? (
            <span
              className={`truncate rounded-md px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-90 ${currentOption.color}`}
            >
              {currentOption.value}
            </span>
          ) : (
            <span className="text-xs text-[var(--n-text-faint)] hover:text-[var(--n-text)]">
              Vazio
            </span>
          )}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            className="z-50 w-[200px] rounded-xl border border-[var(--n-border)] bg-[var(--n-bg)] p-1.5 text-xs shadow-2xl animate-in fade-in zoom-in-95"
          >
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--n-text-faint)]">
              Selecionar {column.name}
            </div>
            <div className="max-h-[160px] space-y-0.5 overflow-y-auto">
              {options.map((opt) => (
                <Popover.Item
                  key={opt.id}
                  onSelect={() => onChange(opt.id)}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 outline-none hover:bg-[var(--n-hover)]"
                >
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${opt.color}`}>
                    {opt.value}
                  </span>
                  {(opt.id === value || opt.value === value) && (
                    <Check size={12} className="text-[var(--n-accent)]" />
                  )}
                </Popover.Item>
              ))}
            </div>
            {value && (
              <div className="mt-1 border-t border-[var(--n-border)] pt-1">
                <Popover.Item
                  onSelect={() => onChange(null)}
                  className="cursor-pointer rounded-lg px-2 py-1 text-center text-[11px] text-[var(--n-text-faint)] outline-none hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]"
                >
                  Limpar seleção
                </Popover.Item>
              </div>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  // Multi-Select Column
  if (column.type === "multi_select") {
    const options = column.options ?? [];
    const selectedIds: string[] = Array.isArray(value) ? value : value ? [value] : [];

    const toggleOption = (optId: string) => {
      const exists = selectedIds.includes(optId);
      const updated = exists ? selectedIds.filter((id) => id !== optId) : [...selectedIds, optId];
      onChange(updated);
    };

    return (
      <Popover.Root>
        <Popover.Trigger className="inline-flex max-w-full flex-wrap items-center gap-1 rounded px-1.5 py-0.5 text-xs outline-none hover:bg-[var(--n-hover)]">
          {selectedIds.length > 0 ? (
            selectedIds.map((id) => {
              const opt = options.find((o) => o.id === id || o.value === id);
              if (!opt) return null;
              return (
                <span
                  key={opt.id}
                  className={`truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium ${opt.color}`}
                >
                  {opt.value}
                </span>
              );
            })
          ) : (
            <span className="text-xs text-[var(--n-text-faint)] hover:text-[var(--n-text)]">
              Vazio
            </span>
          )}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            className="z-50 w-[220px] rounded-xl border border-[var(--n-border)] bg-[var(--n-bg)] p-1.5 text-xs shadow-2xl animate-in fade-in zoom-in-95"
          >
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--n-text-faint)]">
              Selecionar tags
            </div>
            <div className="max-h-[180px] space-y-0.5 overflow-y-auto">
              {options.map((opt) => {
                const isSelected = selectedIds.includes(opt.id);
                return (
                  <div
                    key={opt.id}
                    onClick={() => toggleOption(opt.id)}
                    className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 hover:bg-[var(--n-hover)]"
                  >
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${opt.color}`}>
                      {opt.value}
                    </span>
                    {isSelected && <Check size={12} className="text-[var(--n-accent)]" />}
                  </div>
                );
              })}
            </div>
            {selectedIds.length > 0 && (
              <div className="mt-1 border-t border-[var(--n-border)] pt-1">
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="w-full rounded-lg px-2 py-1 text-center text-[11px] text-[var(--n-text-faint)] hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]"
                >
                  Limpar todas
                </button>
              </div>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  // Date Column
  if (column.type === "date") {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="bg-transparent text-xs text-[var(--n-text-muted)] outline-none hover:text-[var(--n-text)]"
        />
      </div>
    );
  }

  // Number Column
  if (column.type === "number") {
    return (
      <input
        type="number"
        value={value ?? ""}
        placeholder="0"
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
        className="w-full bg-transparent py-0.5 text-sm text-[var(--n-text)] outline-none placeholder:text-[var(--n-text-faint)]"
      />
    );
  }

  // URL Column
  if (column.type === "url") {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="url"
          value={value ?? ""}
          placeholder="https://…"
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent py-0.5 text-xs text-[var(--n-text)] outline-none placeholder:text-[var(--n-text-faint)]"
        />
        {value && (
          <a
            href={value.startsWith("http") ? value : `https://${value}`}
            target="_blank"
            rel="noreferrer"
            className="rounded p-0.5 text-[var(--n-text-faint)] hover:text-[var(--n-accent)]"
            title="Abrir link"
          >
            <ExternalLink size={11} />
          </a>
        )}
      </div>
    );
  }

  // Email Column
  if (column.type === "email") {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="email"
          value={value ?? ""}
          placeholder="exemplo@email.com"
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent py-0.5 text-xs text-[var(--n-text)] outline-none placeholder:text-[var(--n-text-faint)]"
        />
        {value && (
          <a
            href={`mailto:${value}`}
            className="rounded p-0.5 text-[var(--n-text-faint)] hover:text-[var(--n-accent)]"
          >
            <Mail size={11} />
          </a>
        )}
      </div>
    );
  }

  // Phone Column
  if (column.type === "phone") {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="tel"
          value={value ?? ""}
          placeholder="+55 11 99999-9999"
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent py-0.5 text-xs text-[var(--n-text)] outline-none placeholder:text-[var(--n-text-faint)]"
        />
        {value && (
          <a
            href={`tel:${value}`}
            className="rounded p-0.5 text-[var(--n-text-faint)] hover:text-[var(--n-accent)]"
          >
            <Phone size={11} />
          </a>
        )}
      </div>
    );
  }

  // Person Column
  if (column.type === "person") {
    return (
      <div className="flex items-center gap-1.5">
        <div className="grid h-4 w-4 place-items-center rounded-full bg-[var(--n-hover)] text-[var(--n-text-muted)]">
          <User size={10} />
        </div>
        <input
          type="text"
          value={value ?? ""}
          placeholder="Atribuir pessoa…"
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent py-0.5 text-xs text-[var(--n-text)] outline-none placeholder:text-[var(--n-text-faint)]"
        />
      </div>
    );
  }

  // Files & Media Column
  if (column.type === "files") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-[var(--n-text-faint)]">
        <Paperclip size={12} />
        <input
          type="text"
          value={value ?? ""}
          placeholder="Anexo / Link do arquivo"
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent py-0.5 text-xs text-[var(--n-text)] outline-none placeholder:text-[var(--n-text-faint)]"
        />
      </div>
    );
  }

  // Default Text Column
  return (
    <input
      type="text"
      value={value ?? ""}
      placeholder="Vazio"
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-transparent py-0.5 text-sm text-[var(--n-text)] outline-none placeholder:text-[var(--n-text-faint)]"
    />
  );
}
