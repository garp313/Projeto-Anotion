"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ChevronsRight,
  Maximize2,
  Share2,
  Star,
  MoreHorizontal,
  Plus,
  Trash2,
  MessageSquare,
  Smile,
  Image as ImageIcon,
  Columns,
  Square,
  X,
  Check,
} from "lucide-react";
import * as Popover from "@radix-ui/react-dropdown-menu";
import type { ColumnSchema, ColumnType, DatabaseRow, PeekMode, SelectOption } from "./types";
import { CellEditor } from "./CellEditor";
import { ColumnMenu } from "./ColumnMenu";
import { PropertyTypeMenu, getPropertyIcon } from "./PropertyTypeMenu";
import { BlockEditor } from "@/components/editor/BlockEditor";
import { EmojiPicker } from "@/components/editor/EmojiPicker";
import { CoverPicker } from "@/components/editor/CoverPicker";

type Props = {
  row: DatabaseRow;
  schema: ColumnSchema[];
  mode: PeekMode;
  onModeChange: (mode: PeekMode) => void;
  onClose: () => void;
  onUpdateCell: (rowId: string, columnId: string, value: any) => void;
  onUpdateRowMeta?: (rowId: string, patch: { title?: string; icon?: string | null; cover?: string | null }) => void;
  onDeleteRow: (rowId: string) => void;
  onAddColumn: (name: string, type: ColumnType) => void;
  onUpdateColumnSchema: (newSchema: ColumnSchema[]) => void;
};

export function SidePeek({
  row,
  schema,
  mode,
  onModeChange,
  onClose,
  onUpdateCell,
  onUpdateRowMeta,
  onDeleteRow,
  onAddColumn,
  onUpdateColumnSchema,
}: Props) {
  const [title, setTitle] = useState(row.title);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<{ id: string; text: string; date: string }[]>(() => {
    return (row.row_properties?._comments as any[]) ?? [];
  });
  const [newPropOpen, setNewPropOpen] = useState(false);
  const [newPropName, setNewPropName] = useState("");
  const [newPropType, setNewPropType] = useState<ColumnType>("text");
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    setTitle(row.title);
  }, [row.title]);

  const handleTitleBlur = () => {
    if (title !== row.title) {
      onUpdateCell(row.id, "title", title);
    }
  };

  const handleAddComment = () => {
    if (!commentText.trim()) return;
    const newComment = {
      id: "c_" + Date.now(),
      text: commentText.trim(),
      date: new Date().toLocaleDateString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    };
    const updated = [...comments, newComment];
    setComments(updated);
    onUpdateCell(row.id, "_comments", updated);
    setCommentText("");
  };

  const handleCreateProperty = (type: ColumnType) => {
    const defaultName = newPropName.trim() || `Propriedade ${schema.length}`;
    onAddColumn(defaultName, type);
    setNewPropName("");
    setNewPropType("text");
    setShowTypeSelector(false);
    setNewPropOpen(false);
  };

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(`${window.location.origin}/workspace/${row.id}`);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const contentJSX = (
    <div className="flex h-full flex-col bg-[var(--n-bg)] text-[var(--n-text)]">
      {/* Top Action Bar (Matches Notion Image 4) */}
      <div className="sticky top-0 z-30 flex h-11 shrink-0 items-center justify-between border-b border-[var(--n-border)] bg-[var(--n-bg)]/95 px-4 backdrop-blur">
        {/* Left: Close side peek & View modes */}
        <div className="flex items-center gap-1">
          <button
            onClick={onClose}
            className="flex items-center gap-1 rounded-md p-1.5 text-[var(--n-text-muted)] hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]"
            title="Fechar visualização lateral (Esc)"
          >
            <ChevronsRight size={16} />
          </button>

          <div className="mx-1 h-3.5 w-[1px] bg-[var(--n-border)]" />

          {/* Toggle between Side Peek and Center Modal */}
          <button
            onClick={() => onModeChange("side")}
            className={`rounded-md p-1.5 transition-colors ${
              mode === "side"
                ? "bg-[var(--n-active)] text-[var(--n-text)] font-semibold"
                : "text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]"
            }`}
            title="Visualização lateral (Side Peek)"
          >
            <Columns size={14} />
          </button>

          <button
            onClick={() => onModeChange("center")}
            className={`rounded-md p-1.5 transition-colors ${
              mode === "center"
                ? "bg-[var(--n-active)] text-[var(--n-text)] font-semibold"
                : "text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]"
            }`}
            title="Visualização central (Modal)"
          >
            <Square size={14} />
          </button>

          <Link
            href={`/workspace/${row.id}`}
            className="flex items-center gap-1 rounded-md p-1.5 text-[var(--n-text-muted)] hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]"
            title="Abrir como página inteira"
          >
            <Maximize2 size={14} />
          </Link>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--n-text-muted)] hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]"
            title="Copiar link da página"
          >
            {copiedLink ? <Check size={13} className="text-emerald-500" /> : <Share2 size={13} />}
            <span>{copiedLink ? "Copiado!" : "Compartilhar"}</span>
          </button>

          <button
            className="rounded-md p-1.5 text-[var(--n-text-muted)] hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]"
            title="Favoritar"
          >
            <Star size={14} />
          </button>

          <Popover.Root>
            <Popover.Trigger className="rounded-md p-1.5 text-[var(--n-text-muted)] hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]">
              <MoreHorizontal size={14} />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="end"
                className="z-50 w-44 rounded-xl border border-[var(--n-border)] bg-[var(--n-bg)] p-1 text-xs shadow-xl"
              >
                <Popover.Item
                  onSelect={() => {
                    onDeleteRow(row.id);
                    onClose();
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-red-500 outline-none hover:bg-red-500/10"
                >
                  <Trash2 size={13} />
                  <span>Mover para lixeira</span>
                </Popover.Item>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* Cover Image if set */}
        {row.cover && (
          <div className="group relative -mx-8 -mt-6 mb-6 h-36 w-[calc(100%+4rem)] overflow-hidden">
            <div className={`h-full w-full ${row.cover}`} />
            <button
              onClick={() => onUpdateRowMeta?.(row.id, { cover: null })}
              className="absolute right-3 top-3 hidden rounded bg-black/60 px-2 py-1 text-xs text-white backdrop-blur group-hover:block"
            >
              Remover capa
            </button>
          </div>
        )}

        {/* Hover buttons for Cover & Icon */}
        <div className="mb-2 flex items-center gap-2 text-xs text-[var(--n-text-faint)]">
          {!row.icon && (
            <Popover.Root>
              <Popover.Trigger className="flex items-center gap-1 rounded px-2 py-1 hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]">
                <Smile size={13} /> Adicionar ícone
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content align="start" className="z-50">
                  <EmojiPicker onSelect={(emoji: string) => onUpdateRowMeta?.(row.id, { icon: emoji })} />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          )}

          {!row.cover && (
            <Popover.Root>
              <Popover.Trigger className="flex items-center gap-1 rounded px-2 py-1 hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]">
                <ImageIcon size={13} /> Adicionar capa
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content align="start" className="z-50">
                  <CoverPicker onPick={(cov: string) => onUpdateRowMeta?.(row.id, { cover: cov })} />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          )}
        </div>

        {/* Page Icon Display */}
        {row.icon && (
          <div className="mb-2 text-4xl">
            <Popover.Root>
              <Popover.Trigger className="rounded hover:bg-[var(--n-hover)]">
                {row.icon}
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content align="start" className="z-50">
                  <EmojiPicker
                    onSelect={(emoji: string) => onUpdateRowMeta?.(row.id, { icon: emoji })}
                    onRemove={() => onUpdateRowMeta?.(row.id, { icon: null })}
                  />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        )}

        {/* Big Editable Page Title (PROJETO EXEMPLO) */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          placeholder="Sem título"
          className="mb-6 w-full bg-transparent text-3xl font-bold tracking-tight text-[var(--n-text)] outline-none placeholder:text-[var(--n-text-faint)]"
        />

        {/* Properties List (Matches Notion Image 4) */}
        <div className="mb-6 space-y-1">
          {schema.map((col, index) => {
            if (col.id === "title") return null;

            return (
              <div
                key={col.id}
                className="group flex min-h-[32px] items-center rounded-lg px-2 text-xs transition-colors hover:bg-[var(--n-hover)]/40"
              >
                {/* Column Name & Type Icon with ColumnMenu */}
                <div className="flex w-36 shrink-0 items-center gap-2 text-[var(--n-text-muted)]">
                  <ColumnMenu
                    column={col}
                    isFirst={index === 1}
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
                    onOptionsChange={(newOpts) => {
                      onUpdateColumnSchema(
                        schema.map((c) => (c.id === col.id ? { ...c, options: newOpts } : c))
                      );
                    }}
                    onDelete={() => {
                      onUpdateColumnSchema(schema.filter((c) => c.id !== col.id));
                    }}
                  >
                    <button className="flex items-center gap-1.5 truncate rounded px-1.5 py-0.5 hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]">
                      {getPropertyIcon(col.type, 13)}
                      <span className="truncate">{col.name}</span>
                    </button>
                  </ColumnMenu>
                </div>

                {/* Property Value Cell Editor */}
                <div className="flex-1">
                  <CellEditor
                    column={col}
                    row={row}
                    value={row.row_properties?.[col.id]}
                    onChange={(val) => onUpdateCell(row.id, col.id, val)}
                  />
                </div>
              </div>
            );
          })}

          {/* + Add a property button (Matches Image 4) */}
          <div className="pt-1">
            <Popover.Root open={newPropOpen} onOpenChange={setNewPropOpen}>
              <Popover.Trigger className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-[var(--n-text-faint)] hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]">
                <Plus size={13} />
                <span>Adicionar uma propriedade</span>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  align="start"
                  className="z-50 w-[260px] rounded-xl border border-[var(--n-border)] bg-[var(--n-bg)] p-2 text-xs shadow-2xl"
                >
                  <p className="mb-2 font-semibold text-[var(--n-text-muted)]">Nova Propriedade</p>
                  <input
                    type="text"
                    placeholder="Nome da propriedade…"
                    value={newPropName}
                    onChange={(e) => setNewPropName(e.target.value)}
                    className="mb-2 w-full rounded border border-[var(--n-border)] bg-[var(--n-bg)] px-2 py-1 text-xs outline-none focus:border-[var(--n-accent)]"
                  />
                  <div className="mb-1 text-[11px] font-semibold text-[var(--n-text-faint)]">
                    Escolher tipo:
                  </div>
                  <PropertyTypeMenu
                    onSelect={(type) => handleCreateProperty(type)}
                  />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        </div>

        {/* Divider */}
        <div className="my-6 border-t border-[var(--n-border)]" />

        {/* Comments Section (Matches Image 4) */}
        <div className="mb-8 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--n-text-muted)]">
            <MessageSquare size={14} />
            <span>Comentários</span>
            {comments.length > 0 && (
              <span className="rounded-full bg-[var(--n-hover)] px-1.5 py-0.2 text-[10px] text-[var(--n-text-faint)]">
                {comments.length}
              </span>
            )}
          </div>

          {/* Existing comments */}
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2 rounded-lg bg-[var(--n-bg-sidebar)]/40 p-2 text-xs">
              <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--n-accent)] text-[10px] font-bold text-white">
                EU
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between text-[10px] text-[var(--n-text-faint)]">
                  <span className="font-semibold text-[var(--n-text)]">Você</span>
                  <span>{c.date}</span>
                </div>
                <p className="mt-0.5 text-[var(--n-text)]">{c.text}</p>
              </div>
            </div>
          ))}

          {/* Add a comment input (Image 4) */}
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--n-accent)]/20 text-xs font-bold text-[var(--n-accent)]">
              EU
            </div>
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-[var(--n-border)] bg-[var(--n-bg-sidebar)]/30 px-3 py-1.5 text-xs focus-within:border-[var(--n-accent)] focus-within:bg-[var(--n-bg)]">
              <input
                type="text"
                placeholder="Adicionar um comentário…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                className="w-full bg-transparent outline-none placeholder:text-[var(--n-text-faint)]"
              />
              <button
                type="button"
                onClick={handleAddComment}
                disabled={!commentText.trim()}
                className="rounded bg-[var(--n-accent)] px-2 py-0.5 font-medium text-white hover:brightness-95 disabled:opacity-40"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>

        {/* Divider before Block Editor */}
        <div className="my-6 border-t border-[var(--n-border)]" />

        {/* Full Block Note Editor for Deep In-Depth Notes! */}
        <div className="min-h-[350px]">
          <BlockEditor
            key={row.id}
            pageId={row.id}
            initialContent={row.content_json ?? []}
          />
        </div>
      </div>
    </div>
  );

  // If Center Modal mode:
  if (mode === "center") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
        <div
          className="relative h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-[var(--n-border)] bg-[var(--n-bg)] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {contentJSX}
        </div>
      </div>
    );
  }

  // Side Peek mode: Right Panel (Matches Image 4)
  return (
    <div className="h-full w-full border-l border-[var(--n-border)] bg-[var(--n-bg)] shadow-xl animate-in slide-in-from-right duration-200">
      {contentJSX}
    </div>
  );
}
