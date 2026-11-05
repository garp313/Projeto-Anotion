import JSZip from "jszip";
import Papa from "papaparse";

export type NotionDb = { id: string; name: string; path: string; headers: string[]; rows: Record<string, string>[]; parent: string | null };
export type NotionPage = {
  id: string; title: string; icon: string | null; path: string; parent: string | null;
  /** Corpo sem o título e sem o cabeçalho de propriedades repetido pelo Notion. */
  body: string;
  /** Página que é linha de um banco do export. */
  rowOf: string | null;
};
export type NotionExport = { file: string; databases: NotionDb[]; pages: NotionPage[]; assets: Map<string, Uint8Array> };

const ENTRY = /^(.*?)\s+([0-9a-f]{32})(_all)?\.(md|csv)$/i;
const ICON = /^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s+(.*)$/u;

const baseName = (p: string) => p.split("/").pop() ?? p;
const dirName = (p: string) => p.split("/").slice(0, -1).join("/");
const stripBom = (s: string) => s.replace(/^﻿/, "");

export function parseCsvText(text: string, path: string, name = baseName(path).replace(/\.csv$/i, "")): NotionDb {
  const parsed = Papa.parse<Record<string, string>>(stripBom(text), { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
  const entry = ENTRY.exec(baseName(path));
  const headers = (parsed.meta.fields ?? []).filter(Boolean);
  return { id: entry?.[2]?.toLowerCase() ?? `csv:${name}`, name: entry?.[1]?.trim() ?? name, path, headers, rows: parsed.data, parent: null };
}

/** Título, ícone e corpo do .md, sem o bloco "Propriedade: valor" que abre as páginas de linha. */
export function splitMarkdown(md: string) {
  const lines = stripBom(md).split(/\r?\n/);
  const heading = /^#\s+(.*)$/.exec(lines[0] ?? "");
  let i = heading ? 1 : 0;
  while (lines[i] === "") i++;
  const start = i;
  while (i < lines.length && /^[^\s:#\[!|>-][^:]{0,60}:\s/.test(lines[i])) i++;
  // Só é cabeçalho se terminar em linha vazia: um parágrafo com ":" não pode ser engolido.
  const header = i > start && (lines[i] === "" || i === lines.length);
  const raw = heading?.[1].trim() ?? "";
  const icon = ICON.exec(raw);
  return { title: icon?.[2] ?? raw, icon: icon?.[1] ?? null, body: lines.slice(header ? i : start).join("\n").trim() };
}

async function collect(zip: JSZip, prefix: string, files: Map<string, Uint8Array>) {
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const data = await entry.async("uint8array");
    const path = `${prefix}${entry.name}`;
    // Exports grandes vêm em partes: um zip dentro do outro.
    if (/\.zip$/i.test(entry.name)) await collect(await JSZip.loadAsync(data), prefix, files);
    else files.set(path, data);
  }
}

const decode = (b: Uint8Array) => new TextDecoder("utf-8").decode(b);

export async function readNotionZip(data: ArrayBuffer | Uint8Array, file: string): Promise<NotionExport> {
  const files = new Map<string, Uint8Array>();
  await collect(await JSZip.loadAsync(data), "", files);

  const paths = [...files.keys()];
  const entries = paths.map((path) => ({ path, match: ENTRY.exec(baseName(path)) }));

  // O _all traz todas as colunas e linhas; a versão simples é só a visão salva do mesmo banco.
  const csvs = entries.filter((e) => /\.csv$/i.test(e.path));
  const best = new Map<string, { path: string; all: boolean }>();
  for (const { path, match } of csvs) {
    const key = match?.[2]?.toLowerCase() ?? path;
    const all = Boolean(match?.[3]);
    if (!best.has(key) || all) best.set(key, { path, all });
  }
  const databases = [...best.values()].map(({ path }) => parseCsvText(decode(files.get(path)!), path));

  const mds = entries.filter((e) => /\.md$/i.test(e.path));
  const folderOf = (p: string) => p.replace(/\.md$/i, "");
  const csvFolder = (db: NotionDb) => db.path.replace(/(_all)?\.csv$/i, "");
  const bodies = new Map(mds.map((e) => [e.path, decode(files.get(e.path)!)]));

  const pages: NotionPage[] = mds.map(({ path, match }) => {
    const text = splitMarkdown(bodies.get(path)!);
    const dir = dirName(path);
    const owner = databases.find((d) => csvFolder(d) === dir);
    const parent = mds.find((m) => folderOf(m.path) === dir)?.path ?? null;
    return {
      id: match?.[2]?.toLowerCase() ?? `md:${path}`, title: text.title || match?.[1]?.trim() || "Sem título",
      icon: text.icon, path, parent, body: text.body, rowOf: owner?.id ?? null,
    };
  });

  // Banco interno: pela pasta da página, ou por um link da página para o CSV.
  for (const db of databases) {
    const dir = dirName(db.path);
    const byFolder = mds.find((m) => folderOf(m.path) === dir)?.path;
    const id = ENTRY.exec(baseName(db.path))?.[2]?.toLowerCase();
    const byLink = id ? pages.find((p) => bodies.get(p.path)?.toLowerCase().includes(id))?.path : undefined;
    db.parent = byFolder ?? byLink ?? null;
  }

  const assets = new Map(paths.filter((p) => !/\.(md|csv)$/i.test(p)).map((p) => [p, files.get(p)!]));
  return { file, databases, pages, assets };
}

export async function readNotionFile(file: File): Promise<NotionExport> {
  if (/\.csv$/i.test(file.name)) {
    return { file: file.name, databases: [parseCsvText(await file.text(), file.name)], pages: [], assets: new Map() };
  }
  return readNotionZip(await file.arrayBuffer(), file.name);
}

/** Tira do corpo os links para CSV: o banco interno entra como bloco no lugar. */
export const dropCsvLinks = (body: string) => body.replace(/^\s*\[[^\]]*\]\([^)]*\.csv\)\s*$/gim, "").trim();
