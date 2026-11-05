/** Conversores puros de valores exportados pelo Notion. Sem dependência de tela nem de banco. */

export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

export type ParsedDate = { start: string; end: string | null; time: boolean };

const pad = (n: number | string) => String(n).padStart(2, "0");
const MONTHS = ["jan", "fev|feb", "mar", "abr|apr", "mai|may", "jun", "jul", "ago|aug", "set|sep", "out|oct", "nov", "dez|dec"];
const monthOf = (word: string) => MONTHS.findIndex((m) => new RegExp(`^(${m})`, "i").test(word)) + 1;

function validDay(year: number, month: number, day: number) {
  if (year < 1900 || year > 2100) return null;
  const d = new Date(year, month - 1, day);
  return d.getMonth() === month - 1 && d.getDate() === day ? `${year}-${pad(month)}-${pad(day)}` : null;
}

function clock(rest: string) {
  const m = /(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(rest);
  if (!m) return null;
  let hour = Number(m[1]);
  if (m[3]?.toLowerCase() === "pm" && hour < 12) hour += 12;
  if (m[3]?.toLowerCase() === "am" && hour === 12) hour = 0;
  return hour < 24 && Number(m[2]) < 60 ? `${pad(hour)}:${m[2]}` : null;
}

function parseOne(text: string): { day: string; time: string | null } | null {
  const s = text.trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(.*)$/.exec(s);
  if (m) { const day = validDay(+m[3], +m[2], +m[1]); return day ? { day, time: clock(m[4]) } : null; }
  m = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(s);
  if (m) { const day = validDay(+m[1], +m[2], +m[3]); return day ? { day, time: clock(m[4]) } : null; }
  m = /^([a-zç]+)\.? (\d{1,2}),? (\d{4})(.*)$/i.exec(s);
  if (m && monthOf(m[1])) { const day = validDay(+m[3], monthOf(m[1]), +m[2]); return day ? { day, time: clock(m[4]) } : null; }
  m = /^(\d{1,2}) de ([a-zç]+)\.? de (\d{4})(.*)$/i.exec(s);
  if (m && monthOf(m[2])) { const day = validDay(+m[3], monthOf(m[2]), +m[1]); return day ? { day, time: clock(m[4]) } : null; }
  return null;
}

/** Aceita dd/MM/yyyy, ISO, por extenso em português e inglês, com hora e intervalo "a → b". */
export function parseDate(text: string): ParsedDate | null {
  const [a, b] = text.split(/\s*(?:→|->)\s*/);
  const start = parseOne(a ?? "");
  if (!start) return null;
  const end = b ? parseOne(b) : null;
  if (b && !end) return null;
  const time = Boolean(start.time || end?.time);
  const stamp = (d: { day: string; time: string | null }) => (time ? `${d.day}T${d.time ?? "09:00"}` : d.day);
  return { start: stamp(start), end: end ? stamp(end) : null, time };
}

/** Número com vírgula ou ponto decimal: "1.234,50", "1,234.50", "12,5". */
export function parseNumber(text: string): number | null {
  const raw = text.trim().replace(/[^\d,.-]/g, "");
  if (!/\d/.test(raw)) return null;
  const comma = raw.lastIndexOf(","), dot = raw.lastIndexOf(".");
  const decimal = comma > dot ? "," : ".";
  const normal = (comma > -1 && dot > -1) || comma > -1
    ? raw.split(decimal === "," ? "." : ",").join("").replace(decimal, ".")
    : raw;
  const n = Number(normal);
  return Number.isNaN(n) ? null : n;
}

/**
 * Percentual em pontos, como o formato "Porcentagem" do app guarda: "70%" e "0.7" viram 70.
 * Sem o símbolo, valor até 1 é fração.
 */
export function parsePercent(text: string): number | null {
  const n = parseNumber(text);
  if (n === null) return null;
  const value = text.includes("%") || Math.abs(n) > 1 ? n : n * 100;
  return Math.round(value * 100) / 100;
}

/** Separa por vírgula respeitando aspas. */
export function parseMulti(text: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return [...new Set(out.map((v) => v.trim()).filter(Boolean))];
}

export function parseCheckbox(text: string): boolean | null {
  const v = fold(text);
  if (["yes", "sim", "true", "1", "x", "checked"].includes(v)) return true;
  if (["no", "nao", "false", "0", "", "unchecked"].includes(v)) return false;
  return null;
}

export type ParsedRelation = { title: string; id: string | null };

/** Formato do Notion: "Verificar BI (https://www.notion.so/...-<32hex>?pvs=21), Outra (https://...)". */
export function parseRelation(text: string): ParsedRelation[] {
  const links = [...text.matchAll(/([^,(]+?)\s*\((https?:\/\/[^)\s]*notion[^)\s]*)\)/gi)];
  if (links.length) return links.map((m) => ({ title: m[1].trim(), id: /([0-9a-f]{32})/i.exec(m[2])?.[1]?.toLowerCase() ?? null }));
  return parseMulti(text).map((title) => ({ title, id: null }));
}

export const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** Nomes iguais, ou um é parte do outro: "Thiago Costa" e "Thiago da Silva Costa". */
export function nameMatch(a: string, b: string): "exact" | "partial" | null {
  const x = fold(a), y = fold(b);
  if (!x || !y) return null;
  if (x === y) return "exact";
  const [small, big] = x.length <= y.length ? [x, y] : [y, x];
  const tokens = small.split(" ").filter((t) => t.length > 1);
  const words = big.split(" ");
  return tokens.length >= 2 && tokens.every((t) => words.some((w) => w === t || w.startsWith(`${t}.`) || (t.endsWith(".") && w.startsWith(t.slice(0, -1))))) ? "partial" : null;
}
