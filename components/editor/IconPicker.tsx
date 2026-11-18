"use client";
import { useMemo, useState } from "react";
import { Shuffle } from "lucide-react";
import { fieldClass } from "@/components/database/ui";
import { ALL_EMOJIS, EMOJI_CATEGORIES } from "./emojiData";

const RECENT_KEY = "anotion:recent-icons";
const readRecent = (): string[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]").filter((x: unknown) => typeof x === "string").slice(0, 16); } catch { return []; }
};
const pushRecent = (e: string) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...readRecent().filter((x) => x !== e)].slice(0, 16))); } catch { /* sem armazenamento: só não lembra */ }
};
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Um ou mais emojis, sem letras: aceita o que a pessoa colar do teclado de emojis (Win + .).
const looksLikeEmoji = (s: string) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s) && !/[\p{L}\p{N}]/u.test(s.replace(/[#*0-9]️?⃣/gu, ""));

export const randomEmoji = () => ALL_EMOJIS[Math.floor(Math.random() * ALL_EMOJIS.length)].e;

type Tab = "emoji" | "upload" | "link";

/** Escolher emoji, enviar imagem ou colar o link de uma imagem. */
export function IconPicker({ onPick, onRemove, onUpload, status }: {
  onPick: (icon: string) => void; onRemove?: () => void; onUpload: () => void; status?: string | null;
}) {
  const [tab, setTab] = useState<Tab>("emoji");
  const [q, setQ] = useState("");
  const [link, setLink] = useState("");
  const [bad, setBad] = useState<string | null>(null);
  const recent = useMemo(readRecent, []);
  const pick = (e: string) => { pushRecent(e); onPick(e); };

  const query = fold(q.trim());
  const found = query ? ALL_EMOJIS.filter((x) => fold(x.k).split(" ").some((w) => w.startsWith(query)) || fold(x.k).includes(query)) : [];
  const pasted = q.trim() && looksLikeEmoji(q.trim()) ? q.trim() : null;

  const cell = "grid h-8 w-8 place-items-center rounded text-xl hover:bg-[var(--n-hover)] focus:bg-[var(--n-hover)] outline-none";
  const tabBtn = (t: Tab, label: string) => (
    <button type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
      className={`border-b-2 px-2 py-1 text-sm ${tab === t ? "border-[var(--n-text)] font-medium" : "border-transparent text-[var(--n-text-muted)] hover:text-[var(--n-text)]"}`}>{label}</button>
  );
  const grid = (items: string[]) => (
    <div className="grid grid-cols-8 gap-0.5">
      {items.map((e) => <button key={e} type="button" title={ALL_EMOJIS.find((x) => x.e === e)?.k.split(" ")[0] ?? e} onClick={() => pick(e)} className={cell}>{e}</button>)}
    </div>
  );

  return (
    <div aria-label="Escolher ícone" className="w-full">
      <div role="tablist" className="mb-2 flex items-center gap-1 border-b border-[var(--n-border)]">
        {tabBtn("emoji", "Emojis")}
        {tabBtn("upload", "Enviar imagem")}
        {tabBtn("link", "Link")}
        {onRemove && <button type="button" onClick={onRemove} className="ml-auto rounded px-2 py-1 text-sm text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]">Remover</button>}
      </div>

      {tab === "emoji" && (
        <>
          <div className="mb-2 flex gap-1">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ou colar um emoji…" aria-label="Buscar emoji" className={fieldClass} />
            <button type="button" title="Aleatório" aria-label="Emoji aleatório" onClick={() => pick(randomEmoji())} className="shrink-0 rounded border border-[var(--n-border)] px-2 hover:bg-[var(--n-hover)]"><Shuffle size={14} /></button>
          </div>
          <div className="n-scroll max-h-[300px] overflow-y-auto pr-1">
            {query || pasted ? (
              <>
                {pasted && !found.some((x) => x.e === pasted) && (
                  <button type="button" onClick={() => pick(pasted)} className="mb-1 flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-[var(--n-hover)]">
                    <span className="text-xl">{pasted}</span> Usar este emoji
                  </button>
                )}
                {found.length ? grid(found.map((x) => x.e)) : !pasted && (
                  <p className="px-1 py-2 text-xs text-[var(--n-text-faint)]">Nada encontrado. Dica: cole qualquer emoji aqui (no Windows, tecla Windows + ponto abre o teclado de emojis).</p>
                )}
              </>
            ) : (
              <>
                {recent.length > 0 && (
                  <section className="mb-2">
                    <h3 className="mb-1 px-1 text-xs text-[var(--n-text-faint)]">Recentes</h3>
                    {grid(recent)}
                  </section>
                )}
                {EMOJI_CATEGORIES.map((c) => (
                  <section key={c.name} className="mb-2">
                    <h3 className="mb-1 px-1 text-xs text-[var(--n-text-faint)]">{c.name}</h3>
                    {grid(c.items.map((x) => x.e))}
                  </section>
                ))}
              </>
            )}
          </div>
        </>
      )}

      {tab === "upload" && (
        <div className="space-y-2 p-1">
          <button type="button" onClick={onUpload} className="w-full rounded border border-[var(--n-border)] px-2 py-1.5 text-sm hover:bg-[var(--n-hover)]">Escolher imagem do computador</button>
          <p className="text-xs text-[var(--n-text-faint)]">PNG, JPG, WEBP ou GIF, até 5 MB. Imagens quadradas ficam melhores; o resto é cortado no centro.</p>
          {status && <p role="status" className="text-xs text-[var(--n-text-muted)]">{status}</p>}
        </div>
      )}

      {tab === "link" && (
        <form className="space-y-2 p-1" onSubmit={(e) => {
          e.preventDefault();
          const url = link.trim();
          if (!/^https:\/\/\S+$/.test(url)) return setBad("Cole um link que comece com https://");
          setBad(null);
          onPick(url);
        }}>
          <input autoFocus value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…/imagem.png" aria-label="Link da imagem" className={fieldClass} />
          <button type="submit" className="w-full rounded bg-[var(--n-accent)] px-2 py-1 text-sm font-medium text-white">Usar imagem</button>
          {bad && <p role="alert" className="text-xs text-red-500">{bad}</p>}
        </form>
      )}
    </div>
  );
}
