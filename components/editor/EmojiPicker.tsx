"use client";
import * as Popover from "@radix-ui/react-dropdown-menu";

export const NOTION_EMOJIS = [
  "📄", "📝", "📚", "💡", "🚀", "🎯", "✅", "📅", "🏠", "💼", "🧠", "🔥",
  "⭐", "🎨", "🛠️", "📊", "🌱", "🎵", "🍕", "✈️", "❤️", "🔒", "📌", "🧪",
  "☕", "💻", "📦", "📈", "🔍", "🔑", "🏆", "🌟", "⚡", "✨", "🤖", "🌐"
];

type Props = {
  onSelect: (emoji: string) => void;
  onRemove?: () => void;
};

export function EmojiPicker({ onSelect, onRemove }: Props) {
  return (
    <div className="w-[280px] rounded-xl border border-[var(--n-border)] bg-[var(--n-bg)] p-2 shadow-2xl">
      <div className="mb-2 px-1 text-[11px] font-semibold text-[var(--n-text-faint)]">
        Selecionar ícone
      </div>
      <div className="grid grid-cols-6 gap-1">
        {NOTION_EMOJIS.map((e) => (
          <Popover.Item
            key={e}
            onSelect={() => onSelect(e)}
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-xl outline-none hover:bg-[var(--n-hover)] data-[highlighted]:bg-[var(--n-hover)]"
          >
            {e}
          </Popover.Item>
        ))}
      </div>
      {onRemove && (
        <div className="mt-2 border-t border-[var(--n-border)] pt-1">
          <Popover.Item
            onSelect={onRemove}
            className="w-full cursor-pointer rounded-lg px-2 py-1 text-center text-xs text-[var(--n-text-faint)] outline-none hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]"
          >
            Remover ícone
          </Popover.Item>
        </div>
      )}
    </div>
  );
}
