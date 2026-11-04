"use client";

import { useState, useEffect } from "react";
import { CoverPicker } from "./CoverPicker";
import { EmojiPicker } from "./EmojiPicker";

type PageHeaderProps = {
  title: string;
  icon?: string | null;
  coverUrl?: string | null;
  onUpdateTitle: (title: string) => void;
  onUpdateIcon: (icon: string | null) => void;
  onUpdateCover: (coverUrl: string | null) => void;
};

export function PageHeader({
  title,
  icon,
  coverUrl,
  onUpdateTitle,
  onUpdateIcon,
  onUpdateCover,
}: PageHeaderProps) {
  const [value, setValue] = useState(title || "");

  // Sincroniza o estado local quando o título prop muda
  useEffect(() => {
    setValue(title || "");
  }, [title]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onUpdateTitle(newValue);
  };

  return (
    <div className="relative w-full">
      <CoverPicker coverUrl={coverUrl} onChangeCover={onUpdateCover} />

      <div className="mx-auto max-w-4xl px-12 pt-4">
        <div className="mb-2">
          <EmojiPicker
            currentIcon={icon}
            onSelectEmoji={onUpdateIcon}
            onSelect={onUpdateIcon}
          >
            {icon ? (
              <button type="button" className="text-5xl hover:opacity-80 transition-opacity">
                {icon}
              </button>
            ) : (
              <button
                type="button"
                className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-[var(--n-text-faint)] hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]"
              >
                😀 Adicionar ícone
              </button>
            )}
          </EmojiPicker>
        </div>

        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="Sem título"
          className="w-full bg-transparent text-4xl font-bold text-[var(--n-text)] outline-none placeholder:text-[var(--n-text-faint)]"
        />
      </div>
    </div>
  );
}