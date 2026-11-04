"use client";

import { useState, useRef, useEffect, ReactNode } from "react";

type EmojiPickerProps = {
  currentIcon?: string | null;
  onSelectEmoji?: (icon: string | null) => void;
  onSelect?: (icon: string | null) => void;
  children: ReactNode;
};

const NOTION_EMOJIS = [
  "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣",
  "🎯", "🚀", "💡", "🔥", "⭐", "🎉", "📝", "📌",
  "⚙️", "🛠️", "📊", "📈", "💻", "📁", "📂", "📅"
];

export function EmojiPicker({ onSelectEmoji, onSelect, children }: EmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Captura a função independentemente do nome usado na prop
  const handleSelect = (emoji: string | null) => {
    if (onSelectEmoji) onSelectEmoji(emoji);
    if (onSelect) onSelect(emoji);
    setIsOpen(false);
  };

  // Fecha o popover ao clicar fora dele
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <div 
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }} 
        className="cursor-pointer"
      >
        {children}
      </div>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-[var(--n-border)] bg-[var(--n-bg)] p-3 shadow-xl outline-none">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[var(--n-text-muted)]">
            <span>Escolher ícone</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(null);
              }}
              className="text-[10px] text-red-500 hover:underline"
            >
              Remover
            </button>
          </div>

          <div className="grid grid-cols-6 gap-1">
            {NOTION_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  handleSelect(e);
                }}
                className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-xl outline-none hover:bg-[var(--n-hover)] focus:bg-[var(--n-hover)]"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}