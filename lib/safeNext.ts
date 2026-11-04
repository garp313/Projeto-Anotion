/** Só aceita caminho interno: "//site.com" ou "/\site.com" levariam a pessoa para fora do app. */
export function safeNext(path?: string | null) {
  return path && /^\/(?![/\\])/.test(path) && !path.includes("\\") ? path : null;
}
