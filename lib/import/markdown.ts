"use client";
import { BlockNoteEditor } from "@blocknote/core";
import type { Member } from "./mapping";

let editor: BlockNoteEditor | null = null;
const parser = () => (editor ??= BlockNoteEditor.create());

const MENTION = /@([\p{L}][\p{L}.' -]*)/u;

/** Troca "@Nome" por menção real quando a pessoa é membro. Quem não é continua como texto. */
function linkMentions(blocks: any[], members: Member[]): any[] {
  const find = (text: string) => members
    .map((m) => ({ m, label: m.name || m.email }))
    .sort((a, b) => b.label.length - a.label.length)
    .find(({ label }) => text.toLowerCase().startsWith(label.toLowerCase()));

  const splitText = (item: any): any[] => {
    const out: any[] = [];
    let rest: string = item.text;
    for (let hit = MENTION.exec(rest); hit; hit = MENTION.exec(rest)) {
      const found = find(rest.slice(hit.index + 1));
      if (!found) break;
      if (hit.index) out.push({ ...item, text: rest.slice(0, hit.index) });
      out.push({ type: "mention", props: { kind: "person", label: found.label, target: found.m.id } });
      rest = rest.slice(hit.index + 1 + found.label.length);
    }
    if (rest) out.push({ ...item, text: rest });
    return out;
  };
  return blocks.map((b) => ({
    ...b,
    ...(Array.isArray(b.content) ? { content: b.content.flatMap((c: any) => (c.type === "text" ? splitText(c) : [c])) } : {}),
    children: b.children?.length ? linkMentions(b.children, members) : b.children ?? [],
  }));
}

export async function markdownToBlocks(md: string, members: Member[]) {
  if (!md.trim()) return [];
  return linkMentions(await parser().tryParseMarkdownToBlocks(md), members);
}

/** Reescreve imagens e links do .md para os endereços daqui. */
export async function rewriteLinks(md: string, dir: string, resolvePage: (target: string) => string | undefined, upload: (path: string) => Promise<string | null>) {
  let out = md;
  for (const m of [...md.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)]) {
    if (/^https?:/i.test(m[1])) continue;
    const path = [dir, decodeURIComponent(m[1])].filter(Boolean).join("/");
    const url = await upload(path);
    if (url) out = out.split(m[1]).join(url);
  }
  return out.replace(/\]\(([^)\s]+\.md)\)/gi, (whole, target) => {
    const id = resolvePage(decodeURIComponent(target));
    return id ? `](/workspace/${id})` : whole;
  });
}
