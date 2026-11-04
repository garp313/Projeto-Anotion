"use client";
const COVERS = [
  "linear-gradient(135deg,#f6d365,#fda085)",
  "linear-gradient(135deg,#a1c4fd,#c2e9fb)",
  "linear-gradient(135deg,#d4fc79,#96e6a1)",
  "linear-gradient(135deg,#fbc2eb,#a6c1ee)",
  "linear-gradient(135deg,#434343,#000000)",
  "#e9e5e3", "#ffe2dd", "#fdecc8", "#dbeddb", "#d3e5ef",
];

export function CoverPicker({ onPick, onRemove }: { onPick: (c: string) => void; onRemove?: () => void }) {
  return (
    <div className="w-[320px] rounded-md border border-[var(--n-border)] bg-[var(--n-bg)] p-3 shadow-lg">
      <p className="mb-2 text-xs font-medium text-[var(--n-text-faint)]">Cores e gradientes</p>
      <div className="grid grid-cols-5 gap-2">
        {COVERS.map((c) => (
          <button key={c} aria-label="Escolher capa" onClick={() => onPick(c)} style={{ background: c }}
            className="h-10 rounded border border-[var(--n-border)] hover:ring-2 hover:ring-[var(--n-accent)]" />
        ))}
      </div>
      {onRemove && <button onClick={onRemove} className="mt-3 w-full rounded py-1 text-sm text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]">Remover capa</button>}
      {/* Próximo passo: aba "Unsplash" via rota /api/unsplash */}
    </div>
  );
}
