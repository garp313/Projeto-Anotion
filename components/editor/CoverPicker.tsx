"use client";

import { useState } from "react";
import { Image, Upload, X } from "lucide-react";

type CoverPickerProps = {
  coverUrl?: string | null;
  onChangeCover: (url: string | null) => void;
};

// Fotos pré-definidas estilo Notion
const PRESET_COVERS = [
  "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1200&q=80",
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&q=80",
  "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1200&q=80",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80",
];

export function CoverPicker({ coverUrl, onChangeCover }: CoverPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customUrl, setCustomUrl] = useState("");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Cria uma URL local para preview imediato da foto
      const localUrl = URL.createObjectURL(file);
      onChangeCover(localUrl);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative group/cover w-full">
      {/* Exibição da Capa */}
      {coverUrl ? (
        <div className="relative h-48 w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt="Capa da página"
            className="h-full w-full object-cover"
          />
          <div className="absolute right-4 bottom-2 hidden gap-2 group-hover/cover:flex">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center gap-1.5 rounded bg-black/60 px-2 py-1 text-xs text-white backdrop-blur hover:bg-black/80"
            >
              <Image size={13} /> Alterar capa
            </button>
            <button
              onClick={() => onChangeCover(null)}
              className="flex items-center gap-1.5 rounded bg-black/60 px-2 py-1 text-xs text-white backdrop-blur hover:bg-black/80"
            >
              <X size={13} /> Remover
            </button>
          </div>
        </div>
      ) : (
        <div className="px-12 pt-4 opacity-0 group-hover/cover:opacity-100 transition-opacity">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-[var(--n-text-faint)] hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]"
          >
            <Image size={13} /> Adicionar capa
          </button>
        </div>
      )}

      {/* Modal/Popover de Escolha de Capa */}
      {isOpen && (
        <div className="absolute left-12 top-10 z-50 w-80 rounded-lg border border-[var(--n-border)] bg-[var(--n-bg)] p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[var(--n-text)]">
            <span>Escolher capa</span>
            <button onClick={() => setIsOpen(false)}>
              <X size={14} />
            </button>
          </div>

          {/* Opção 1: Upload de foto local */}
          <div className="mb-3">
            <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-[var(--n-border)] p-2 text-xs text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]">
              <Upload size={14} />
              <span>Anexar foto do computador</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </div>

          {/* Opção 2: URL Externa */}
          <div className="mb-3 space-y-1">
            <input
              type="text"
              placeholder="Cole a URL de uma imagem..."
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              className="w-full rounded border border-[var(--n-border)] bg-transparent px-2 py-1 text-xs text-[var(--n-text)] outline-none"
            />
            {customUrl && (
              <button
                onClick={() => {
                  onChangeCover(customUrl);
                  setIsOpen(false);
                }}
                className="w-full rounded bg-[var(--n-accent)] py-1 text-xs text-white"
              >
                Usar imagem
              </button>
            )}
          </div>

          {/* Opção 3: Cores e Galeria Pré-definida */}
          <div className="text-[10px] font-semibold uppercase text-[var(--n-text-faint)] mb-1.5">
            Galeria Notion
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {PRESET_COVERS.map((url, i) => (
              <button
                key={i}
                onClick={() => {
                  onChangeCover(url);
                  setIsOpen(false);
                }}
                className="h-12 w-full overflow-hidden rounded border border-[var(--n-border)] hover:opacity-80"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Cover" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}