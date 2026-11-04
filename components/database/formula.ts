/** Linguagem de fórmulas no estilo Notion: prop("X"), operadores, if/ifs e funções comuns. */
type Tok = { t: "num" | "str" | "id" | "op"; v: string };
type Node =
  | { k: "lit"; v: any }
  | { k: "call"; name: string; args: Node[] }
  | { k: "un"; op: string; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "cond"; c: Node; a: Node; b: Node };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ t: "num", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1, s = "";
      while (j < src.length && src[j] !== ch) { if (src[j] === "\\") j++; s += src[j++]; }
      if (j >= src.length) throw new Error("Texto sem aspas de fechamento");
      out.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }
    if (/[\p{L}_]/u.test(ch)) {
      let j = i;
      while (j < src.length && /[\p{L}\p{N}_]/u.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["==", "!=", ">=", "<=", "&&", "||"].includes(two)) { out.push({ t: "op", v: two }); i += 2; continue; }
    if ("+-*/%^()<>,?:!".includes(ch)) { out.push({ t: "op", v: ch }); i++; continue; }
    throw new Error(`Caractere inesperado: ${ch}`);
  }
  return out;
}

const PREC: Record<string, number> = {
  "||": 1, or: 1, "&&": 2, and: 2, "==": 3, "!=": 3, ">": 4, "<": 4, ">=": 4, "<=": 4,
  "+": 5, "-": 5, "*": 6, "/": 6, "%": 6, "^": 7,
};

export function parseFormula(src: string): Node {
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === "op" && peek().v === v;
  const expect = (v: string) => { if (!isOp(v)) throw new Error(`Esperado "${v}"`); p++; };

  function primary(): Node {
    const t = toks[p++];
    if (!t) throw new Error("Fórmula incompleta");
    if (t.t === "num") return { k: "lit", v: Number(t.v) };
    if (t.t === "str") return { k: "lit", v: t.v };
    if (t.t === "op" && t.v === "(") { const e = ternary(); expect(")"); return e; }
    if (t.t === "op" && (t.v === "-" || t.v === "!")) return { k: "un", op: t.v, a: primary() };
    if (t.t === "id") {
      if (t.v === "true" || t.v === "false") return { k: "lit", v: t.v === "true" };
      if (t.v === "not") return { k: "un", op: "!", a: primary() };
      if (isOp("(")) {
        p++;
        const args: Node[] = [];
        if (!isOp(")")) {
          args.push(ternary());
          while (isOp(",")) { p++; args.push(ternary()); }
        }
        expect(")");
        return { k: "call", name: t.v, args };
      }
      return { k: "call", name: t.v, args: [] };
    }
    throw new Error(`Símbolo inesperado: ${t.v}`);
  }
  function binary(min: number): Node {
    let a = primary();
    for (;;) {
      const t = peek();
      const op = t && (t.t === "op" || t.v === "and" || t.v === "or") ? t.v : "";
      const pr = PREC[op];
      if (!pr || pr < min) return a;
      p++;
      a = { k: "bin", op, a, b: binary(op === "^" ? pr : pr + 1) };
    }
  }
  function ternary(): Node {
    const c = binary(1);
    if (!isOp("?")) return c;
    p++;
    const a = ternary();
    expect(":");
    return { k: "cond", c, a, b: ternary() };
  }
  const n = ternary();
  if (p < toks.length) throw new Error(`Símbolo inesperado: ${toks[p].v}`);
  return n;
}

const toDate = (v: any): Date => (v instanceof Date ? v : new Date(typeof v === "object" && v?.start ? v.start : v));
const isEmpty = (v: any) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
const text = (v: any): string =>
  v instanceof Date ? v.toLocaleDateString("pt-BR") : Array.isArray(v) ? v.join(", ") : isEmpty(v) ? "" : String(v);
const DAY = 86_400_000;
const UNIT: Record<string, number> = {
  days: DAY, day: DAY, weeks: 7 * DAY, week: 7 * DAY, hours: 3_600_000, hour: 3_600_000, minutes: 60_000, minute: 60_000,
};

function addTime(d: Date, n: number, unit: string) {
  const r = new Date(d);
  if (unit.startsWith("month")) r.setMonth(r.getMonth() + n);
  else if (unit.startsWith("year")) r.setFullYear(r.getFullYear() + n);
  else r.setTime(r.getTime() + n * (UNIT[unit] ?? DAY));
  return r;
}

function formatDate(d: Date, f: string) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return f.replace(/YYYY/g, String(d.getFullYear())).replace(/MM/g, pad(d.getMonth() + 1))
    .replace(/DD/g, pad(d.getDate())).replace(/HH/g, pad(d.getHours())).replace(/mm/g, pad(d.getMinutes()));
}

const FN: Record<string, (...a: any[]) => any> = {
  add: (a, b) => (typeof a === "number" && typeof b === "number" ? a + b : text(a) + text(b)),
  subtract: (a, b) => a - b, multiply: (a, b) => a * b, divide: (a, b) => a / b, mod: (a, b) => a % b, pow: (a, b) => a ** b,
  abs: Math.abs, floor: Math.floor, ceil: Math.ceil, sqrt: Math.sqrt, sign: Math.sign,
  round: (a, n = 0) => { const m = 10 ** n; return Math.round(a * m) / m; },
  min: (...a) => Math.min(...a.flat()), max: (...a) => Math.max(...a.flat()),
  sum: (...a) => a.flat().reduce((s, x) => s + Number(x || 0), 0),
  mean: (...a) => { const l = a.flat(); return l.reduce((s, x) => s + Number(x || 0), 0) / (l.length || 1); },
  concat: (...a) => a.map(text).join(""),
  join: (sep, ...a) => a.flat().map(text).join(text(sep)),
  length: (a) => (Array.isArray(a) ? a.length : text(a).length),
  lower: (a) => text(a).toLowerCase(), upper: (a) => text(a).toUpperCase(), trim: (a) => text(a).trim(),
  contains: (a, b) => (Array.isArray(a) ? a.includes(b) : text(a).includes(text(b))),
  replace: (a, b, c) => text(a).replace(text(b), text(c)),
  replaceAll: (a, b, c) => text(a).split(text(b)).join(text(c)),
  substring: (a, i, j) => text(a).substring(i, j),
  test: (a, b) => new RegExp(text(b)).test(text(a)),
  format: text,
  toNumber: (a) => (a instanceof Date ? a.getTime() : Number(a)),
  empty: isEmpty, equal: (a, b) => a === b, unequal: (a, b) => a !== b,
  now: () => new Date(),
  today: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; },
  date: (d) => toDate(d).getDate(), day: (d) => toDate(d).getDay(), month: (d) => toDate(d).getMonth() + 1,
  year: (d) => toDate(d).getFullYear(), hour: (d) => toDate(d).getHours(), minute: (d) => toDate(d).getMinutes(),
  dateAdd: (d, n, u = "days") => addTime(toDate(d), n, u),
  dateSubtract: (d, n, u = "days") => addTime(toDate(d), -n, u),
  dateBetween: (a, b, u = "days") => {
    const x = toDate(a), y = toDate(b);
    if (u.startsWith("month")) return (x.getFullYear() - y.getFullYear()) * 12 + x.getMonth() - y.getMonth();
    if (u.startsWith("year")) return x.getFullYear() - y.getFullYear();
    return Math.trunc((x.getTime() - y.getTime()) / (UNIT[u] ?? DAY));
  },
  formatDate: (d, f = "DD/MM/YYYY") => formatDate(toDate(d), f),
  timestamp: (d) => toDate(d).getTime(),
  fromTimestamp: (n) => new Date(n),
};

function ev(n: Node, prop: (name: string) => any): any {
  switch (n.k) {
    case "lit": return n.v;
    case "un": { const a = ev(n.a, prop); return n.op === "-" ? -a : !a; }
    case "cond": return ev(n.c, prop) ? ev(n.a, prop) : ev(n.b, prop);
    case "bin": {
      if (n.op === "&&" || n.op === "and") return ev(n.a, prop) && ev(n.b, prop);
      if (n.op === "||" || n.op === "or") return ev(n.a, prop) || ev(n.b, prop);
      let a = ev(n.a, prop), b = ev(n.b, prop);
      if (a instanceof Date) a = a.getTime();
      if (b instanceof Date) b = b.getTime();
      switch (n.op) {
        case "+": return typeof a === "number" && typeof b === "number" ? a + b : text(a) + text(b);
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "%": return a % b;
        case "^": return a ** b;
        case "==": return a === b;
        case "!=": return a !== b;
        case ">": return a > b;
        case "<": return a < b;
        case ">=": return a >= b;
        case "<=": return a <= b;
      }
      throw new Error(`Operador desconhecido: ${n.op}`);
    }
    case "call": {
      if (n.name === "prop") return prop(String(ev(n.args[0], prop)));
      if (n.name === "if") return ev(n.args[0], prop) ? ev(n.args[1], prop) : n.args[2] ? ev(n.args[2], prop) : "";
      if (n.name === "ifs") {
        for (let i = 0; i + 1 < n.args.length; i += 2) if (ev(n.args[i], prop)) return ev(n.args[i + 1], prop);
        return n.args.length % 2 ? ev(n.args[n.args.length - 1], prop) : "";
      }
      const f = FN[n.name];
      if (!f) throw new Error(`Função desconhecida: ${n.name}`);
      return f(...n.args.map((a) => ev(a, prop)));
    }
  }
}

const cache = new Map<string, Node | Error>();
/** Avalia a fórmula. Devolve {error} em vez de lançar, para a célula mostrar o problema. */
export function evalFormula(src: string, prop: (name: string) => any): { value?: any; error?: string } {
  if (!src?.trim()) return { value: "" };
  let ast = cache.get(src);
  if (!ast) {
    try { ast = parseFormula(src); } catch (e) { ast = e as Error; }
    cache.set(src, ast);
  }
  if (ast instanceof Error) return { error: ast.message };
  try { return { value: ev(ast, prop) }; } catch (e) { return { error: (e as Error).message }; }
}
