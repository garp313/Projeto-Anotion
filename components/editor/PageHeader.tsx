"use client";
import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-dropdown-menu";
import { ImagePlus, Smile, Table, FileText } from "lucide-react";
import { usePageTree, type PageFull, type PageRow } from "@/lib/hooks/usePageTree";
import { databasePatch } from "@/components/database/types";
import { createClient } from "@/lib/supabase/client";
import { CoverPicker } from "./CoverPicker";
import { IconPicker, randomEmoji } from "./IconPicker";
import { PageIcon } from "@/components/PageIcon";
import { Pop } from "@/components/database/ui";

const MAX_COVER = 5 * 1024 * 1024;

/** Ícone enviado: recortado no centro e reduzido para 256 px, para não carregar fotos enormes na barra lateral. GIF fica como está. */
async function squareIcon(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const size = Math.min(256, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close();
  return await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("canvas"))), "image/webp", 0.9));
}

export function PageHeader({ page, fullWidth = false }: { page: PageFull; fullWidth?: boolean }) {
  const { updatePage } = usePageTree();
  const [title, setTitle] = useState(page.title);
  const ta = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Fora do menu: abrir a janela de arquivos pode fechar o menu, e o campo sumiria junto com o arquivo.
  const coverFile = useRef<HTMLInputElement>(null);
  const [coverState, setCoverState] = useState<string | null>(null);
  const iconFile = useRef<HTMLInputElement>(null);
  const [iconState, setIconState] = useState<string | null>(null);
  const [iconOpen, setIconOpen] = useState(false);

  async function uploadIcon(file?: File) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return setIconState("Use uma imagem PNG, JPG, WEBP ou GIF.");
    if (file.size > MAX_COVER) return setIconState("A imagem precisa ter até 5 MB.");
    setIconState("Enviando imagem…");
    try {
      const blob = await squareIcon(file);
      const type = blob.type || file.type;
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const path = `${data.session?.user.id}/icons/${crypto.randomUUID()}.${type.split("/")[1]}`;
      const { error } = await supabase.storage.from("covers").upload(path, blob, { contentType: type });
      if (error) throw error;
      patch({ icon: supabase.storage.from("covers").getPublicUrl(path).data.publicUrl });
      setIconState(null);
      setIconOpen(false);
    } catch {
      setIconState("Não foi possível enviar a imagem.");
    }
  }

  async function uploadCover(file?: File) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return setCoverState("Use uma imagem PNG, JPG, WEBP ou GIF.");
    if (file.size > MAX_COVER) return setCoverState("A imagem precisa ter até 5 MB.");
    setCoverState("Enviando imagem…");
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const path = `${data.session?.user.id}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
    const { error } = await supabase.storage.from("covers").upload(path, file, { contentType: file.type });
    if (error) return setCoverState("Não foi possível enviar a imagem.");
    const { publicUrl } = supabase.storage.from("covers").getPublicUrl(path).data;
    patch({ cover: `url("${publicUrl}") center / cover no-repeat` });
    setCoverState(null);
  }

  useEffect(() => setTitle(page.title), [page.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = ta.current; if (el) { el.style.height = "0"; el.style.height = el.scrollHeight + "px"; } }, [title]);

  const patch = (p: Partial<PageRow>) => updatePage.mutate({ id: page.id, patch: p });
  const onTitle = (v: string) => {
    setTitle(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => patch({ title: v }), 300);
  };

  // Em banco de dados os dados são o principal: cabeçalho enxuto para caber mais linhas.
  const compact = page.is_database;
  const ghost = "inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-[var(--n-text-faint)] hover:bg-[var(--n-hover)]";
  const menu = "z-50 rounded-md border border-[var(--n-border)] bg-[var(--n-bg)] shadow-lg";

  return (
    <header className="group/header">
      <input ref={coverFile} type="file" hidden aria-label="Imagem de capa" accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => { void uploadCover(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={iconFile} type="file" hidden aria-label="Imagem do ícone" accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => { setIconOpen(true); void uploadIcon(e.target.files?.[0]); e.target.value = ""; }} />
      {page.cover ? (
        <div className="group/cover relative h-[30vh] min-h-[160px] w-full" style={{ background: page.cover }}>
          <Popover.Root>
            <Popover.Trigger className="absolute bottom-2 right-4 rounded bg-[var(--n-bg)]/80 px-2 py-1 text-xs opacity-0 backdrop-blur group-hover/cover:opacity-100">
              Alterar capa
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="end" className={menu}>
                <CoverPicker onPick={(c) => patch({ cover: c })} onRemove={() => patch({ cover: null })} onUpload={() => coverFile.current?.click()} />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      ) : <div className={compact ? "h-11" : "h-12"} />}

      <div className={fullWidth ? "w-full px-4 sm:px-12" : "mx-auto w-full max-w-[960px] px-4 sm:px-12"}>
        <div className={`relative ${page.cover ? "-mt-9" : ""}`}>
          {page.icon && (
            <Pop open={iconOpen} onOpenChange={(o) => { setIconOpen(o); if (!o) setIconState(null); }} width={320}
              triggerClass={`rounded p-1 leading-none hover:bg-[var(--n-hover)] ${compact ? "text-[32px]" : "text-[56px] sm:text-[72px]"}`}
              trigger={<span aria-label="Trocar ícone" className="block"><PageIcon icon={page.icon} /></span>}>
              <IconPicker status={iconState}
                onPick={(icon) => { patch({ icon }); setIconOpen(false); }}
                onRemove={() => { patch({ icon: null }); setIconOpen(false); }}
                onUpload={() => iconFile.current?.click()} />
            </Pop>
          )}

          {coverState && <p role="status" className="mt-2 text-xs text-[var(--n-text-muted)]">{coverState}</p>}
          {/* só aparecem ao passar o mouse */}
          <div className="mb-1 mt-2 flex gap-1 opacity-0 transition-opacity group-hover/header:opacity-100 focus-within:opacity-100">
            {!page.icon && <button className={ghost} onClick={() => patch({ icon: randomEmoji() })}><Smile size={14} /> Adicionar ícone</button>}
            {!page.cover && (
              <Popover.Root>
                <Popover.Trigger className={ghost}><ImagePlus size={14} /> Adicionar capa</Popover.Trigger>
                <Popover.Portal><Popover.Content align="start" className={menu}><CoverPicker onPick={(c) => patch({ cover: c })} onUpload={() => coverFile.current?.click()} /></Popover.Content></Popover.Portal>
              </Popover.Root>
            )}
            <button
              className={ghost}
              onClick={() => updatePage.mutate({
                id: page.id,
                patch: page.is_database ? { is_database: false } : databasePatch(page),
              })}
            >
              {page.is_database ? <FileText size={14} /> : <Table size={14} />}
              {page.is_database ? "Converter em documento" : "Converter em banco de dados"}
            </button>
          </div>

          <textarea
            ref={ta} rows={1} value={title} placeholder="Sem título" aria-label="Título da página"
            onChange={(e) => onTitle(e.target.value.replace(/\n/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.querySelector<HTMLElement>(".notion-editor [contenteditable=true]")?.focus(); } }}
            className={`mb-2 block w-full resize-none overflow-hidden border-0 bg-transparent font-bold leading-[1.2] tracking-tight ${compact ? "text-2xl" : "text-3xl sm:text-[40px]"} outline-none placeholder:text-[var(--n-text-faint)]`}
          />
        </div>
      </div>
    </header>
  );
}
